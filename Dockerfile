FROM python:3.7.3-slim-stretch

RUN apt-get -y update && apt-get -y install gcc

WORKDIR /
COPY checkpoint /checkpoint
COPY src /src
COPY statics /statics
COPY templates /templates

# Make changes to the requirements/app here.
# This Dockerfile order allows Docker to cache the checkpoint layer
# and improve build times if making changes.
# RUN pip3 --no-cache-dir install tensorflow==1.15.2 gpt-2-simple starlette uvicorn ujson regex aiofiles jinja2
RUN pip3 install tensorflow==1.15.2 gpt-2-simple starlette uvicorn ujson regex aiofiles jinja2
COPY app.py /

# Clean up APT when done.
RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ENV PYTHONPATH "${PYTHONPATH}:src"

ENTRYPOINT ["python3", "-X", "utf8", "app.py"]
