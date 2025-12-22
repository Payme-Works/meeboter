import { setTimeout } from "node:timers/promises";

import type { Bot } from "../bot";
import type { BotLogger } from "../logger";
import type { TrpcClient } from "../trpc";

/**
 * Worker for processing queued chat messages.
 * Polls the backend for messages and sends them via the bot.
 */
export class MessageQueueWorker {
	private abortController: AbortController | null = null;
	private running = false;

	constructor(
		private readonly trpc: TrpcClient,
		private readonly getBot: () => Bot | null,
		private readonly logger: BotLogger,
		private readonly intervalMs = 5000,
	) {}

	/**
	 * Starts the message queue worker
	 */
	start(botId: number): void {
		if (this.running) {
			this.logger.warn("Message queue worker already running");

			return;
		}

		// Check if chat is enabled on the bot
		const bot = this.getBot();

		if (!bot?.settings.chatEnabled) {
			this.logger.debug("Chat functionality is disabled for this bot");

			return;
		}

		this.running = true;
		this.abortController = new AbortController();

		this.logger.info("Starting message queue worker");
		this.runMessageLoop(botId, this.abortController.signal);
	}

	/**
	 * Stops the message queue worker
	 */
	stop(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}

		this.running = false;
		this.logger.debug("Message queue worker stopped");
	}

	/**
	 * Internal message processing loop
	 */
	private async runMessageLoop(
		botId: number,
		abortSignal: AbortSignal,
	): Promise<void> {
		while (!abortSignal.aborted) {
			try {
				const queuedMessage = await this.trpc.bots.chat.dequeueMessage.query({
					botId: String(botId),
				});

				if (queuedMessage?.messageText) {
					const bot = this.getBot();

					if (!bot) {
						this.logger.warn("Bot not available for sending message");

						continue;
					}

					this.logger.debug(
						`Sending queued message: ${queuedMessage.messageText}`,
					);

					// Add random delay between 1-6 seconds before sending message
					const delay = Math.random() * 5000 + 1000;

					this.logger.debug(
						`Waiting ${Math.round(delay)}ms before sending message...`,
					);

					await setTimeout(delay);

					const success = await bot.sendChatMessage(queuedMessage.messageText);

					if (success) {
						this.logger.debug("Message sent successfully");
					} else {
						this.logger.warn("Failed to send message");
					}
				}
			} catch (error) {
				this.logger.warn(
					`Error processing messages: ${error instanceof Error ? error.message : String(error)}`,
				);
			}

			await setTimeout(this.intervalMs);
		}
	}
}
