from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from tensorflow.core.protobuf import rewriter_config_pb2
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import PlainTextResponse
from starlette.templating import Jinja2Templates
from starlette.staticfiles import StaticFiles
from starlette.responses import UJSONResponse
from starlette.responses import FileResponse
from starlette.applications import Starlette
from starlette.middleware import Middleware
import tensorflow as tf
import encoder
import uvicorn
import asyncio
import logging
import pprint
import sample
import model
import regex
import json
import sys
import os
import gc

pp = pprint.PrettyPrinter(indent=2)

# disabling some warnings
os.environ["KMP_WARNINGS"] = "off"

middleware = [Middleware(CORSMiddleware, allow_origins=["*"])]

app = Starlette(debug=False, middleware=middleware)
app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

# https://github.com/encode/uvicorn/issues/523#issuecomment-598522664
logger = logging.getLogger("uvicorn")
logging.getLogger('uvicorn.access').propagate = True
logger.addHandler(logging.FileHandler("logs/errors.log"))
logger.setLevel(logging.DEBUG)

# log utils
def custom_log(x, level="INFO", offset=""):
    if level == "INFO":
        logger.info(f"{offset}{x}")
    if level == "WARNING":
        logger.warning(f"{offset}{x}")
    if level == "ERROR":
        logger.error(f"{offset}{x}")

def overlog(x, level="INFO", offset=""):
    custom_log("-" * len(x), level=level, offset=offset)
    custom_log(x, level=level, offset=offset)
    custom_log(" ", level=level, offset=offset)

def underlog(x, level="INFO", offset=""):
    custom_log(" ", level=level, offset=offset)
    custom_log(x, level=level, offset=offset)
    custom_log("-" * len(x), level=level, offset=offset)

def sandwich_log(x, level="INFO", offset=""):
    custom_log("-" * len(x), level=level, offset=offset)
    custom_log(x, level=level, offset=offset)
    custom_log("-" * len(x), level=level, offset=offset)

custom_log(" ")
custom_log("="*40)
custom_log(" " * 17 + "NEW RUN")
custom_log("="*40)


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

sandwich_log(f"Loading checkpoint {ckpt}")
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

# # for belly-of-the-beast-decoding, see encoder.py
# sandwich_log(f"Dummy run preformed: {enc.decode(out[0])[0]}")
sandwich_log(f"Dummy run preformed: {enc.decode(out[0])}")

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

    # underlog("previous prefix:")
    # custom_log(new_pref)

    char_name = params.get("character", "")
    input_orig = params.get("prefix", "").strip()
    length_desired = 5

    # first request, we add the char name & user input
    if char_name and input_orig:
        # custom_log("adding char and user input")
        # underlog("user input:")
        # custom_log(char_name)
        # custom_log(input_orig)
        pref = f"{new_pref}{start}{char_name}\n{input_orig}{end}"
    # check: new_pref gets erased by the GET reset
    elif new_pref:
        pref = new_pref
    # if no prefix, char or new_pref, just return end marker to stop js
    else:
        return "<|e|>"


    # underlog("prefix:")
    # custom_log(pref)

    # add end of answer, store length of prefix
    end_pref = len(pref)

    context_tokens = enc.encode(pref)
    l = len(context_tokens)
    # underlog(f"current length {l}")

    # underlog('context tokens:', offset='\t\t\t\t')
    # custom_log(context_tokens, offset='\t\t\t\t')

    # checks for length, in case input is very long
    # max_length = 1023 - length_desired
    limit = 512
    max_length = limit - length_desired
    if l > max_length:
        context_tokens = context_tokens[-max_length:]
        l = len(context_tokens)
        end_pref = len(enc.decode(context_tokens))

        # # for belly-of-the-beast-decoding, see encoder.py
        # end_pref = len(enc.decode(context_tokens)[0])

        # underlog(f"exceeding {limit} total tokens in regenerating", level='WARNING')
        # custom_log(f"end of prefix at index {end_pref}, trimmed context length: {l}", level='WARNING')

    out = sess.run(
        output, feed_dict={context: 1 * [context_tokens], length: length_desired},
    )

    pref = enc.decode(out[0])

    # # for belly-of-the-beast-decoding, see encoder.py
    # pref, warning = enc.decode(out[0])
    # if warning > 0:
    #     underlog(f"FOUND {warning} ILLEGAL TOKENS", level='ERROR', offset="\t\t\t")
    #     custom_log(f"length sanity check:", level='ERROR', offset="\t\t\t")
    #     custom_log(f"length of out - given context: {len(out[0] - l)}", level='ERROR', offset="\t\t\t")
    #     underlog(f"raw out, last {length_desired} tokens:", level='ERROR', offset="\t\t\t")
    #     custom_log(f"{out[0,-5:]}", level='ERROR', offset="\t\t\t")
    #     sys.exit()

    # underlog("current pref:")
    # custom_log(pref)

    l_no_pref = pref[end_pref:]
    new_length = len(l_no_pref)

    l_enc = l_no_pref.encode('utf-8')
    custom_log(f"{l_no_pref}")
    custom_log(f"| utf-8: {l_enc} | tokens: {out[0,-length_desired:]}", offset="\t\t\t\t")

    m = regex.search(r, l_no_pref)
    if m:
        underlog("found end marker", offset='\t\t\t\t')
        end_ind = m.span()[0]
        new_pref = f"{pref[:end_pref+end_ind]}\n<|e|>"
    else:
        new_pref = pref

    # underlog("new prefix stored:")
    # custom_log(new_pref)

    # custom_log('-'*40)

    return l_no_pref

@app.route("/debug", methods=["GET"])
async def debug(request):
    filename = "logs/errors.log"
    if os.path.isfile(filename):
        return FileResponse(filename)
    else:
        return PlainTextResponse("No error logs found")

@app.route("/", methods=["GET", "HEAD", "POST"])
async def homepage(request):

    global new_pref
    # global generate_count

    if request.method in ("GET", "HEAD"):
        new_pref = ""
        return templates.TemplateResponse("home.html", {"request": request})
    elif request.method == "POST":
        params = await request.json()
        # underlog('received params', offset='\t\t\t\t')
        # custom_log(params, offset='\t\t\t\t')
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
        log_level='debug'
    )

# if __name__ == "__main__":
#     uvicorn.run(
#         app,
#         host="0.0.0.0",
#         port=int(os.environ.get("PORT", 8080)),
#         root_path="***Cloud Run web address***",
#         log_level='debug'
#     )
