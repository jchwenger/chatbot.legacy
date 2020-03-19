from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from tensorflow.core.protobuf import rewriter_config_pb2
from starlette.middleware.cors import CORSMiddleware
from starlette.templating import Jinja2Templates
from starlette.staticfiles import StaticFiles
from starlette.responses import UJSONResponse
from starlette.applications import Starlette
from starlette.middleware import Middleware
import tensorflow as tf
import encoder
import uvicorn
import asyncio
import pprint
import sample
import model
import regex
import json
import os
import gc

pp = pprint.PrettyPrinter(indent=2)


def cprint(x):
    print()
    print(x)
    print("-" * len(x))


# disabling some warnings
os.environ["KMP_WARNINGS"] = "off"

middleware = [Middleware(CORSMiddleware, allow_origins=["*"])]

app = Starlette(debug=False, middleware=middleware)
app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")


config = tf.compat.v1.ConfigProto()
config.gpu_options.allow_growth = True
config.graph_options.rewrite_options.layout_optimizer = (
    rewriter_config_pb2.RewriterConfig.OFF
)

# if threads > 0:
#     config.intra_op_parallelism_threads = threads
#     config.inter_op_parallelism_threads = threads

sess = tf.compat.v1.Session(config=config)

hparams = model.default_hparams()
with open("checkpoint/run1/hparams.json") as f:
    hparams.override_from_dict(json.load(f))

context = tf.compat.v1.placeholder(tf.int32, [1, None])
output = model.model(hparams=hparams, X=context)

ckpt = tf.train.latest_checkpoint("checkpoint/run1")
saver = tf.compat.v1.train.Saver(allow_empty=True)
sess.run(tf.compat.v1.global_variables_initializer())

msg = f"Loading checkpoint {ckpt}"
print("-" * len(msg))
print(msg)
print("-" * len(msg))
saver.restore(sess, ckpt)

enc = encoder.get_encoder("run1")

context = tf.compat.v1.placeholder(tf.int32, [1, None])
length = tf.compat.v1.placeholder(tf.int32, ())
context_tokens = enc.encode("A")

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

out = sess.run(output, feed_dict={length: 1, context: [context_tokens]})

print("-" * 40)
cprint(f"dummy run preformed: {enc.decode(out[0])}")

# find first response in gpt stream
pref_re = regex.compile("(?<=<\|s\|>\n).*?(?=\n<\|e\|>)", regex.DOTALL)
new_pref = ""

start = "\n<|s|>\n"
end = "\n<|e|>\n"

# regex to find that we reached the end of our answer
r = regex.compile(r"\n<\|e")
produced = 0

# Needed to avoid cross-domain issues
response_header = {"Access-Control-Allow-Origin": "*"}

generate_count = 0


def generate(params):

    global generate_count
    global new_pref
    global produced
    global hparams
    global pref_re
    global output
    global start
    global sess
    global end
    global enc
    global pp
    global r

    # cprint("previous prefix:")
    # print(new_pref)

    char_name = params.get("character", "")
    input_orig = params.get("prefix", "").strip()
    length_desired = 5

    # first request, we add the char name & user input
    if char_name and input_orig:
        print("adding char and user input")
        pref = f"{new_pref}{start}{char_name}\n{input_orig}{end}"
    else:
        pref = new_pref

    cprint("current prefix:")
    print(pref)

    # add end of answer, store length of prefix
    end_pref = len(pref)

    context_tokens = enc.encode(pref)
    l = len(context_tokens)
    cprint(f"current length {l}")

    # checks for length, in case input is very long
    # max_length = 1023 - length_desired
    max_length = 512 - length_desired
    if l > max_length:
        context_tokens = context_tokens[-max_length:]
        l = len(context_tokens)
        end_pref = len(enc.decode(context_tokens))
        cprint(f"exceeding 1023 total tokens in regenerating, trimmed length: {l}")

    out = sess.run(
        output, feed_dict={context: 1 * [context_tokens], length: length_desired},
    )

    pref = enc.decode(out[0])

    cprint("current pref:")
    print(pref)

    l_no_pref = pref[end_pref:]
    new_length = len(l_no_pref)

    cprint("l no pref:")
    print(l_no_pref)

    # produced += new_length - produced

    m = regex.search(r, l_no_pref)
    if m:
        cprint("found end marker")
        print(l_no_pref)
        end_ind = m.span()[0]
        new_pref = f"{pref[:end_pref+end_ind]}\n<|e|>"
    else:
        new_pref = pref

    cprint("new prefix stored:")
    print(new_pref)

    return l_no_pref


@app.route("/", methods=("GET", "HEAD", "POST"))
async def homepage(request):

    global new_pref
    # global generate_count

    if request.method in ("GET", "HEAD"):
        new_pref = ""
        return templates.TemplateResponse("home.html", {"request": request})
    elif request.method == "POST":
        params = await request.json()
        answer = generate(params)
        return UJSONResponse({"text": json.dumps(answer)}, headers=response_header)

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
    uvicorn.run(
        app,
        host="localhost",
        port=int(8080),
        root_path="/",
        # host="0.0.0.0",
        # port=int(os.environ.get("PORT", 8080)),
        # root_path="***Cloud Run web address***",
        proxy_headers=True,
    )
