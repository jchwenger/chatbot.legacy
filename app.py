from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from tensorflow.core.protobuf import rewriter_config_pb2
from starlette.middleware.cors import CORSMiddleware
from starlette.templating import Jinja2Templates
from starlette.staticfiles import StaticFiles
from starlette.responses import UJSONResponse
from starlette.applications import Starlette
from starlette.middleware import Middleware
import tensorflow as tf
import asyncio
import uvicorn
import encoder
import sample
import pprint
import regex
import model
import json
import gc
import os

pp = pprint.PrettyPrinter(indent=2)

def cprint(x):
    print()
    print(x)
    print('-'*len(x))

# disabling some warnings
os.environ["KMP_WARNINGS"] = "off"

middleware = [
        Middleware(CORSMiddleware, allow_origins=['*'])
] 

app = Starlette(debug=False, middleware=middleware)
app.mount('/static', StaticFiles(directory='statics'), name='static')

templates = Jinja2Templates(directory='templates')


config = tf.compat.v1.ConfigProto()
config.gpu_options.allow_growth = True
config.graph_options.rewrite_options.layout_optimizer = (
    rewriter_config_pb2.RewriterConfig.OFF
)

# if threads > 0:
#     config.intra_op_parallelism_threads = threads
#     config.inter_op_parallelism_threads = threads

sess =  tf.compat.v1.Session(config=config)

hparams = model.default_hparams()
with open("checkpoint/run1/hparams.json") as f:
    hparams.override_from_dict(json.load(f))

context = tf.compat.v1.placeholder(tf.int32, [1, None])
output = model.model(hparams=hparams, X=context)

ckpt = tf.train.latest_checkpoint("checkpoint/run1")
saver = tf.compat.v1.train.Saver(allow_empty=True)
sess.run(tf.compat.v1.global_variables_initializer())

print("Loading checkpoint", ckpt)
saver.restore(sess, ckpt)

enc = encoder.get_encoder("run1")

context = tf.compat.v1.placeholder(tf.int32, [1, None])
length = tf.compat.v1.placeholder(tf.int32, ())
context_tokens = enc.encode('A')

output = sample.sample_sequence(
    hparams=hparams,
    length=length,
    start_token=None,
    context=context,
    batch_size=1,
    temperature=1,
    top_k=0,
    top_p=0,
)

out = sess.run(output,
               feed_dict = {
                   length: 1,
                   context: [context_tokens]
               })

print(f'dummy run preformed: {enc.decode(out[0])}')

# find first response in gpt stream
pref_re = regex.compile(
    "(?<=<\|s\|>\n).*?(?=\n<\|e\|>)", regex.DOTALL
)
new_pref = ""

start = '\n<|s|>\n'
end = '\n<|e|>\n'

# Needed to avoid cross-domain issues
response_header = {
    'Access-Control-Allow-Origin': '*'
}

generate_count = 0

async def generate(params):

    global generate_count
    global new_pref
    global pref_re
    global hparams
    global output
    global start
    global sess
    global enc
    global end
    global pp

    cprint("previous prefix:")
    print(new_pref)

    char_name = params.get("character", "")
    input_orig = params.get("prefix", "").strip()
    length_desired = 5

    if char_name:
        pref = f"{new_pref}{start}{char_name}\n{input_orig}{end}"
    else:
        pref = f"{new_pref}{start}{input_orig}{end}"

    cprint("current prefix:")
    print(pref)

    # add end of answer, store length of prefix
    end_pref = len(pref)

    # regex get our first answer, will be filled below
    m = None
    r = regex.compile(r'<\|e\|>')
    produced = 0

    # generation loop
    while not m:

        # length_desired *= 2
        cprint(f"regenerating! adding {length_desired} new tokens.")
        context_tokens = enc.encode(pref)
        l = len(context_tokens)
        cprint(f"re-length: {l}")
        if l > 1023 - length_desired:
            context_tokens = context_tokens[-(1023 - length_desired) :]
            l = len(context_tokens)
            end_pref = l
            cprint(
                f"exceeding 1023 total tokens in regenerating, trimmed length: {l}"
            )

        out = sess.run(
            output,
            feed_dict={context: 1 * [context_tokens], length: length_desired},
        )

        pref = enc.decode(out[0])

        l_no_pref = pref[end_pref:]
        new_length = len(l_no_pref)

        cprint("prefixless re-text:")
        print(l_no_pref)

        cprint("last bit of output:")
        last_bit = l_no_pref[produced:]
        print(last_bit)
        produced += new_length - produced
        print(f'\t\t(produced now {produced} chars)')

        m = regex.search(r, l_no_pref)

        yield last_bit

        cprint('\t\tsleeping hack')
        await asyncio.sleep(1e-15)

    cprint(f'found end marker.')
    end_ind = m.span()[1]
    new_pref = f"{pref[:end_pref+end_ind]}\n<|e|>"

    # cprint(f'time to produce answer: {time.time() - past}')

@app.websocket_route('/ws')
async def websocket_endpoint(websocket):
    await websocket.accept()
    cprint('messages from socket')
    params = await websocket.receive_json()
    cprint('params')
    pp.pprint(params)
    async for answer in generate(params):
        await websocket.send_text(answer)
    await websocket.close()

@app.route("/", methods=["GET"])
async def homepage(request):

    # global generate_count

    new_pref = ""
    params = request.query_params

    return templates.TemplateResponse("home.html", {"request": request})

    # generate_count += 1

    # if generate_count == 8:
    #     # Reload model to prevent Graph/Session from going OOM
    #     tf.reset_default_graph()
    #     sess.close()
    #     sess = gpt2.start_tf_sess(threads=1)
    #     gpt2.load_gpt2(sess)
    #     generate_count = 0

    gc.collect()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
