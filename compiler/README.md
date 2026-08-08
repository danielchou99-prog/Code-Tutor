# Code Tutor Compiler

The compiler uses the official GCC image and is invoked by the FastAPI backend with runtime restrictions.

Build the local image after Docker Desktop is installed and running:

```powershell
docker build -t code-tutor-compiler:local compiler
```

The backend adds these controls for every run:

- no container network
- read-only root filesystem
- dropped Linux capabilities
- no new privileges
- CPU, memory, process, time, and output limits
- unprivileged container user

Do not add a host-based fallback for executing untrusted source code.
