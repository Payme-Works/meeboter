# Use the official Playwright Docker image as the base stage

FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS base

RUN apt-get update && apt-get install -y \
    xvfb \
    ffmpeg \
    x11-utils \
    pulseaudio \
    x11-xserver-utils \
    fluxbox \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/

RUN npm install -g pnpm

COPY ./pnpm-workspace.yaml ./
COPY ./package.json ./
COPY ./pnpm-lock.yaml ./

RUN test -f pnpm-workspace.yaml || (echo "ERROR: Must build from monorepo root directory" && exit 1)

COPY ./apps/bots/ /app/apps/bots/
COPY ./packages/ /app/packages/

RUN sed -i 's/\r$//' /app/apps/bots/providers/meet/entrypoint.sh

RUN pnpm install --frozen-lockfile

RUN pnpm dlx playwright@1.52.0 install-deps
RUN pnpm dlx playwright@1.52.0 install --with-deps

RUN mkdir -p /root/ms-playwright && chmod -R 777 /root/ms-playwright

# Runtime stage

FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS runtime

ENV DOCKER_MEETING_PLATFORM=meet

WORKDIR /app

RUN useradd -ms /bin/bash meetbot && chown -R meetbot:meetbot /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    pulseaudio \
    pulseaudio-utils \
    xserver-xephyr \
    x11-xserver-utils \
    fluxbox \
    pulseaudio \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /root/ms-playwright /root/ms-playwright

COPY --from=base /app/apps/bots/ /app/apps/bots

RUN chown -R meetbot:meetbot /app
RUN chown -R meetbot:meetbot /root/ms-playwright

RUN chown -R meetbot:meetbot /app/apps/bots

ENV DISPLAY=:99

USER meetbot

RUN chmod +x /app/apps/bots/providers/meet/entrypoint.sh

CMD ["/app/apps/bots/providers/meet/entrypoint.sh"]
