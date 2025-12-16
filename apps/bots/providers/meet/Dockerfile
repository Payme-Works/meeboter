# Base

FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS base

RUN echo "Use the official Playwright Docker image as the base stage"

RUN echo "Install system dependencies"

RUN apt-get update && apt-get install -y \
    xvfb \
    ffmpeg \
    x11-utils \
    pulseaudio \
    x11-xserver-utils \
    fluxbox \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/

RUN echo "Copy workspace configuration and files"

COPY ./package.json ./
COPY ./turbo.json ./
COPY ./bun.lock ./

RUN echo "Ensure we're building from monorepo root"

RUN test -f package.json || (echo "ERROR: Must build from monorepo root directory" && exit 1)

RUN echo "Copy node_modules if they exist"

COPY ./node_modules* /app/node_modules

RUN echo "Copy workspace configuration and files"

COPY ./apps/bots/ /app/apps/bots/
COPY ./apps/server/ /app/apps/server/
COPY ./packages/ /app/packages/

RUN echo "Convert entrypoint.sh to use Unix line endings"

RUN sed -i 's/\r$//' /app/apps/bots/providers/meet/entrypoint.sh

RUN echo "Install bun"

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN echo "Skip Puppeteer browser download - using Playwright browsers instead"

ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN echo "Install dependencies"

RUN bun install

RUN echo "Install Playwright dependencies"

RUN bunx playwright@1.52 install-deps
RUN bunx playwright@1.52 install --with-deps

RUN echo "Create Playwright directory"

RUN mkdir -p /root/ms-playwright && chmod -R 777 /root/ms-playwright

# Runtime

FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS runtime

RUN echo "Use the official Playwright Docker image as the runtime stage"

ENV DOCKER_MEETING_PLATFORM=meet

WORKDIR /app

RUN echo "Create user"

RUN useradd -ms /bin/bash meetbot && chown -R meetbot:meetbot /app

RUN echo "Install system dependencies"

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    pulseaudio \
    pulseaudio-utils \
    xserver-xephyr \
    x11-xserver-utils \
    fluxbox \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN echo "Install bun"

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN echo "Copy node_modules and Playwright directory"

COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /root/ms-playwright /root/ms-playwright

COPY --from=base /app/apps/bots/ /app/apps/bots

RUN echo "Change ownership of files"

RUN chown -R meetbot:meetbot /app
RUN chown -R meetbot:meetbot /root/ms-playwright

RUN chown -R meetbot:meetbot /app/apps/bots

RUN echo "Set display"

ENV DISPLAY=:99

USER meetbot

RUN echo "Make entrypoint executable"

RUN chmod +x /app/apps/bots/providers/meet/entrypoint.sh

RUN echo "Command to run the application"

CMD ["/app/apps/bots/providers/meet/entrypoint.sh"]
