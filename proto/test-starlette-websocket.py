from starlette.applications import Starlette
from starlette.responses import HTMLResponse
from starlette.websockets import WebSocket
from jinja2 import Template
import uvicorn
import asyncio

# found here: https://gist.github.com/akiross/a423c4e8449645f2076c44a54488e973

template = """\
<!DOCTYPE HTML>
<html>
<head>
    <script type = "text/javascript">
        function runWebsockets() {
            if ("WebSocket" in window) {
                var ws = new WebSocket("ws://localhost:8000/ws");
                ws.onopen = function() {
                    // console.log("Sending websocket data");
                    ws.send("Hello From Client");
                };
                ws.onmessage = function(e) {
                     document.body.innerHTML += `<p>${e.data}</p>`;
                };
                ws.onclose = function() {
                    console.log("Closing websocket connection");
                };
            } else {
                alert("WS not supported, sorry!");
            }
        }
    </script>
</head>
<body><p><a href="javascript:runWebsockets()">Say Hello From Client</a></p></body>
</html>
"""


app = Starlette()


@app.route('/')
async def homepage(request):
    return HTMLResponse(Template(template).render())

async def gen():
    for i in range(10):
        await asyncio.sleep(1)
        yield f'now at {i}'


@app.websocket_route('/ws')
async def websocket_endpoint(websocket):
    await websocket.accept()
    # Process incoming messages
    # while True:
        # mesg = await websocket.receive_text()
    async for m in gen():
        await websocket.send_text(m)
    await websocket.close()


if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=8000)
