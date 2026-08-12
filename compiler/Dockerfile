FROM gcc:13.4-bookworm

LABEL org.opencontainers.image.title="Code Tutor Compiler"
LABEL org.opencontainers.image.description="Isolated C++20 and Python 3 runtime image for Code Tutor"

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp
