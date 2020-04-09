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
import random
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

# prepare error log dir
if not os.path.isdir("logs"):
    os.mkdir("logs")

# https://github.com/encode/uvicorn/issues/523#issuecomment-598522664
logger = logging.getLogger("uvicorn")
logging.getLogger('uvicorn.access').propagate = True
logger.addHandler(logging.FileHandler("logs/errors.log"))
logger.setLevel(logging.DEBUG)

# log utils
def custom_log(x, level="INFO", offset=""):
    if level == "INFO":
        x = x.replace("\n", "\n\033[32mINFO\033[00m:     ")
        logger.info(f"{offset}{x}")
    if level == "WARNING":
        x = x.replace("\n", "\n\033[33mWARNING\033[00m:  ")
        logger.warning(f"{offset}{x}")
    if level == "ERROR":
        x = x.replace("\n", "\n\033[31mERROR\033[00m:    ")
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

class Model():
    def __init__(self):
        self.config = tf.compat.v1.ConfigProto()
        self.config.gpu_options.allow_growth = True
        self.config.graph_options.rewrite_options.layout_optimizer = (
            rewriter_config_pb2.RewriterConfig.OFF
        )
        self.sess = tf.compat.v1.Session(config=self.config)

        self.hparams = model.default_hparams()
        with open("checkpoint/run1/hparams.json") as f:
            self.hparams.override_from_dict(json.load(f))

        self.context = tf.compat.v1.placeholder(tf.int32, [1, None])
        self.length = tf.compat.v1.placeholder(tf.int32, ())
        self.temperature = tf.compat.v1.placeholder(tf.int32, ())

        self.model = model.model(hparams=self.hparams, X=self.context)

        self.load_checkpoint("checkpoint/run1")
        self.enc = encoder.get_encoder("run1")

        self.output = sample.sample_sequence(
            hparams=self.hparams,
            length=self.length,
            start_token=None,
            context=self.context,
            batch_size=1,
            temperature=self.temperature,
            top_k=0,
            top_p=0,
        )

        # spit out all these warnrings
        self.dummy_run()

    def load_checkpoint(self, path="checkpoint/run1"):
        self.ckpt = tf.train.latest_checkpoint(path)
        self.saver = tf.compat.v1.train.Saver(allow_empty=True)
        self.sess.run(tf.compat.v1.global_variables_initializer())
        sandwich_log(f"Loading checkpoint {self.ckpt}")
        self.saver.restore(self.sess, self.ckpt)

    def run(self, context_tokens, length=5, temperature=1):
        return self.sess.run(self.output, feed_dict={self.length: length,
                                                     self.context: context_tokens,
                                                     self.temperature: temperature})

    def dummy_run(self):
        self.run(context_tokens=[self.enc.encode("A")], length=1)

    def init_letter(self, context_tokens):
        caps_letters = {chr(i) for i in [x for x in range(65, 91)] + [192, 199, 202, 212]}
        out = self.run(1 * [context_tokens], length = 1)
        l = self.enc.decode([out[0,-1]])
        underlog("init letter sampled from model:", level="WARNING")
        custom_log(l, level="WARNING")
        index = 0
        while l[0] not in caps_letters:
            out = self.run(1 * [context_tokens], length = 1)
            l = self.enc.decode([out[0,-1]])
            custom_log(f"rerunning > {l}", level="WARNING")
            if index > 2:
                l = random.choice('ABCDEFGHIJLMN')
                custom_log(f"hacking > {l}", level="WARNING")
            index += 1
        return l


le_model = Model()

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
    global le_model
    global pref_re
    global start
    global end
    global pp
    global r

    # underlog("previous prefix:")
    # custom_log(new_pref)
    length_desired = 5

    char_name = params.get("character", "").strip()
    input_orig = params.get("prefix", "").strip()

    # additional injuction to influence the network's behaviour
    theme_injunction = params.get("theme-injunction", "").strip()
    char_injunction = params.get("character-injunction", "").strip()
    prefix_injunction = params.get("prefix-injunction", "").strip()

    # first request, we add the char name & user input
    if char_name and input_orig:

        pref = f"{new_pref}{start}{char_name}\n{input_orig}"

        custom_log("adding char and user input", level="WARNING")
        underlog("user input:", level="WARNING")
        custom_log(char_name, level="WARNING")
        custom_log(input_orig, level="WARNING")

        if not char_injunction and (theme_injunction or prefix_injunction):
            if theme_injunction:
                pref += f"\n{theme_injunction}"
            if prefix_injunction:
                pref += f"\n{prefix_injunction}"
            underlog("no char injunction, adding theme or prefix to input", level="WARNING")
            custom_log("theme-injunction:", level="WARNING")
            custom_log(theme_injunction, level="WARNING")
            custom_log("prefix-injunction:", level="WARNING")
            custom_log(prefix_injunction, level="WARNING")

        pref += f"{end}"

        if char_injunction:
            if theme_injunction:
                pref += f"<|s|>\n{theme_injunction}\n{char_injunction}\n"
            else:
                pref += f"<|s|>\n{char_injunction}\n"
            if prefix_injunction:
                pref += f"{prefix_injunction}\n"
            end_pref_injunction = len(pref)
            init_letter = le_model.init_letter(le_model.enc.encode(pref))
            pref += f"{init_letter}"
            underlog("char injunction, adding theme or prefix to generation", level="WARNING")
            custom_log("theme-injunction:", level="WARNING")
            custom_log(theme_injunction, level="WARNING")
            custom_log("prefix-injunction:", level="WARNING")
            custom_log(prefix_injunction, level="WARNING")
            custom_log(f"init letter: {init_letter}", level="WARNING")
            end_inj_utf = pref[end_pref_injunction].encode('utf-8')
            custom_log(f"end of prefix: {end_inj_utf}", level="WARNING")

    # check: new_pref gets erased by the GET reset
    elif new_pref:
        pref = new_pref
    # if no prefix, char or new_pref, just return end marker to stop js
    else:
        return "<|e|>"

    underlog("prefix:")
    custom_log(pref)

    # add end of answer, store length of prefix
    end_pref = len(pref)
    cond = char_name and input_orig and char_injunction
    if cond:
        end_pref = end_pref_injunction


    context_tokens = le_model.enc.encode(pref)
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
        # don't include init letter if char injunction
        end_pref = len(le_model.enc.decode(context_tokens)) - len(init_letter) if cond \
                   else len(le_model.enc.decode(context_tokens))

        # # for belly-of-the-beast-decoding, see encoder.py
        # end_pref = len(le_model.enc.decode(context_tokens)[0])

        # underlog(f"exceeding {limit} total tokens in regenerating", level='WARNING')
        # custom_log(f"trimmed context length: {l}", level='WARNING')
        # custom_log(f"new string length: {end_pref}", level='WARNING')
        # custom_log(f"last pref char: {pref[end_pref-1]}", level='WARNING')


    out = le_model.run(1 * [context_tokens], length = length_desired)

    pref = le_model.enc.decode(out[0])

    # # for belly-of-the-beast-decoding, see encoder.py
    # pref, warning = le_model.enc.decode(out[0])
    # if warning > 0:
    #     underlog(f"FOUND {warning} ILLEGAL TOKENS", level='ERROR', offset="\t\t\t")
    #     custom_log(f"length sanity check:", level='ERROR', offset="\t\t\t")
    #     custom_log(f"length of out - given context: {len(out[0] - l)}", level='ERROR', offset="\t\t\t")
    #     underlog(f"raw out, last {length_desired} tokens:", level='ERROR', offset="\t\t\t")
    #     custom_log(f"{out[0,-5:]}", level='ERROR', offset="\t\t\t")
    #     sys.exit()

    # underlog(f"current pref:", level="WARNING")
    # custom_log(pref, level="WARNING")

    l_no_pref = pref[end_pref:]
    new_length = len(l_no_pref)

    l_enc = l_no_pref.encode('utf-8')
    underlog(f"returned chunk:")
    custom_log(f"{l_no_pref}")
    custom_log(f"| utf-8: {l_enc}", offset="\t")
    custom_log(f"| tokens: {out[0,-length_desired:]}", offset="\t")

    m = regex.search(r, l_no_pref)
    if m:
        underlog("found end marker")
        end_ind = m.span()[0]
        new_pref = f"{pref[:end_pref+end_ind]}\n<|e|>"
    else:
        new_pref = pref

    # underlog("new prefix stored:")
    # custom_log(new_pref)

    custom_log('-'*40)

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
