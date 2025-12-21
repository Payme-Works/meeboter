import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { TrpcClient } from "../../trpc";
import { EventCode, STATUS_EVENT_CODES } from "../../trpc";
import { BotEventEmitter } from "../bot-event-emitter";

/**
 * Test scenarios for BotEventEmitter
 *
 * The BotEventEmitter uses a self-listening pattern where:
 * - Events are emitted via native emit("event", eventCode, data)
 * - The emitter listens to its own "event" events and handles side effects
 * - State is auto-set for status events
 * - Backend reporting is fire-and-forget
 */

const createMockTrpc = () => ({
	bots: {
		events: {
			report: {
				mutate: mock(() => Promise.resolve()),
			},
		},
		updateStatus: {
			mutate: mock(() => Promise.resolve()),
		},
	},
});

describe("BotEventEmitter", () => {
	let emitter: BotEventEmitter;
	let mockTrpc: ReturnType<typeof createMockTrpc>;

	beforeEach(() => {
		mockTrpc = createMockTrpc();
		emitter = new BotEventEmitter({
			botId: 123,
			trpc: mockTrpc as unknown as TrpcClient,
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Scenario 1: Initial State
	// ─────────────────────────────────────────────────────────────────────────

	describe("Scenario 1: Initial state", () => {
		it("should have INITIALIZING as initial state", () => {
			expect(emitter.getState()).toBe("INITIALIZING");
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Scenario 2: Event Emission via emit("event", ...)
	// ─────────────────────────────────────────────────────────────────────────

	describe("Scenario 2: Event emission via emit()", () => {
		it("should emit events using native emit()", () => {
			const eventListener = mock(() => {});
			emitter.on("event", eventListener);

			emitter.emit("event", EventCode.JOINING_CALL);

			expect(eventListener).toHaveBeenCalledTimes(1);
			expect(eventListener).toHaveBeenCalledWith(EventCode.JOINING_CALL);
		});

		it("should emit events with data", () => {
			const eventListener = mock(() => {});
			emitter.on("event", eventListener);

			const eventData = { message: "Test message", sub_code: "TEST_001" };
			emitter.emit("event", EventCode.FATAL, eventData);

			expect(eventListener).toHaveBeenCalledWith(EventCode.FATAL, eventData);
		});

		it("should support multiple event emissions", () => {
			const eventListener = mock(() => {});
			emitter.on("event", eventListener);

			emitter.emit("event", EventCode.JOINING_CALL);
			emitter.emit("event", EventCode.IN_WAITING_ROOM);
			emitter.emit("event", EventCode.IN_CALL);

			expect(eventListener).toHaveBeenCalledTimes(3);
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Scenario 3: Auto State Management for Status Events
	// ─────────────────────────────────────────────────────────────────────────

	describe("Scenario 3: Auto state management", () => {
		it("should auto-set state when emitting JOINING_CALL", async () => {
			emitter.emit("event", EventCode.JOINING_CALL);

			// Allow microtask to complete
			await Promise.resolve();

			expect(emitter.getState()).toBe(EventCode.JOINING_CALL);
		});

		it("should auto-set state when emitting IN_WAITING_ROOM", async () => {
			emitter.emit("event", EventCode.IN_WAITING_ROOM);
			await Promise.resolve();

			expect(emitter.getState()).toBe(EventCode.IN_WAITING_ROOM);
		});

		it("should auto-set state when emitting IN_CALL", async () => {
			emitter.emit("event", EventCode.IN_CALL);
			await Promise.resolve();

			expect(emitter.getState()).toBe(EventCode.IN_CALL);
		});

		it("should auto-set state for all status events", async () => {
			for (const statusCode of STATUS_EVENT_CODES) {
				const freshEmitter = new BotEventEmitter({
					botId: 123,
					trpc: createMockTrpc() as unknown as TrpcClient,
				});

				freshEmitter.emit("event", statusCode);
				await Promise.resolve();

				expect(freshEmitter.getState()).toBe(statusCode);
			}
		});

		it("should NOT change state for non-status events", async () => {
			emitter.emit("event", EventCode.PARTICIPANT_JOIN);
			await Promise.resolve();

			expect(emitter.getState()).toBe("INITIALIZING");
		});

		it("should NOT change state for LOG events", async () => {
			emitter.emit("event", EventCode.LOG);
			await Promise.resolve();

			expect(emitter.getState()).toBe("INITIALIZING");
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Scenario 4: stateChange Event Emission
	// ─────────────────────────────────────────────────────────────────────────

	describe("Scenario 4: stateChange event emission", () => {
		it("should emit stateChange for status events", async () => {
			const stateChangeListener = mock(() => {});
			emitter.on("stateChange", stateChangeListener);

			emitter.emit("event", EventCode.JOINING_CALL);
			await Promise.resolve();

			expect(stateChangeListener).toHaveBeenCalledTimes(1);
			expect(stateChangeListener).toHaveBeenCalledWith(
				EventCode.JOINING_CALL,
				"INITIALIZING",
			);
		});

		it("should emit stateChange with correct old and new state", async () => {
			const stateChangeListener = mock(() => {});
			emitter.on("stateChange", stateChangeListener);

			emitter.emit("event", EventCode.JOINING_CALL);
			await Promise.resolve();

			emitter.emit("event", EventCode.IN_WAITING_ROOM);
			await Promise.resolve();

			expect(stateChangeListener).toHaveBeenCalledTimes(2);
			expect(stateChangeListener).toHaveBeenNthCalledWith(
				1,
				EventCode.JOINING_CALL,
				"INITIALIZING",
			);
			expect(stateChangeListener).toHaveBeenNthCalledWith(
				2,
				EventCode.IN_WAITING_ROOM,
				EventCode.JOINING_CALL,
			);
		});

		it("should NOT emit stateChange for non-status events", async () => {
			const stateChangeListener = mock(() => {});
			emitter.on("stateChange", stateChangeListener);

			emitter.emit("event", EventCode.PARTICIPANT_JOIN);
			await Promise.resolve();

			expect(stateChangeListener).not.toHaveBeenCalled();
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Scenario 5: Backend Reporting
	// ─────────────────────────────────────────────────────────────────────────

	describe("Scenario 5: Backend reporting", () => {
		it("should report events to backend", async () => {
			emitter.emit("event", EventCode.JOINING_CALL);

			// Allow async operations to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockTrpc.bots.events.report.mutate).toHaveBeenCalledTimes(1);
			expect(mockTrpc.bots.events.report.mutate).toHaveBeenCalledWith({
				id: "123",
				event: {
					eventType: EventCode.JOINING_CALL,
					eventTime: expect.any(Date),
					data: null,
				},
			});
		});

		it("should report events with data to backend", async () => {
			const eventData = { message: "Error occurred", sub_code: "ERR_001" };
			emitter.emit("event", EventCode.FATAL, eventData);

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockTrpc.bots.events.report.mutate).toHaveBeenCalledWith({
				id: "123",
				event: {
					eventType: EventCode.FATAL,
					eventTime: expect.any(Date),
					data: {
						description: "Error occurred",
						sub_code: "ERR_001",
					},
				},
			});
		});

		it("should update status for status events", async () => {
			emitter.emit("event", EventCode.IN_CALL);

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockTrpc.bots.updateStatus.mutate).toHaveBeenCalledTimes(1);
			expect(mockTrpc.bots.updateStatus.mutate).toHaveBeenCalledWith({
				id: "123",
				status: EventCode.IN_CALL,
			});
		});

		it("should NOT update status for non-status events", async () => {
			emitter.emit("event", EventCode.PARTICIPANT_JOIN);

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockTrpc.bots.events.report.mutate).toHaveBeenCalledTimes(1);
			expect(mockTrpc.bots.updateStatus.mutate).not.toHaveBeenCalled();
		});

		it("should handle backend errors gracefully (fire-and-forget)", async () => {
			mockTrpc.bots.events.report.mutate = mock(() =>
				Promise.reject(new Error("Network error")),
			);

			// Should not throw
			expect(() => emitter.emit("event", EventCode.JOINING_CALL)).not.toThrow();

			await new Promise((resolve) => setTimeout(resolve, 10));

			// Emitter should still function
			expect(emitter.getState()).toBe(EventCode.JOINING_CALL);
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Scenario 6: External Listener Pattern
	// ─────────────────────────────────────────────────────────────────────────

	describe("Scenario 6: External listener pattern", () => {
		it("should allow external listeners to receive events", () => {
			const externalListener = mock(() => {});
			emitter.on("event", externalListener);

			emitter.emit("event", EventCode.IN_CALL);

			expect(externalListener).toHaveBeenCalledWith(EventCode.IN_CALL);
		});

		it("should allow multiple external listeners", () => {
			const listener1 = mock(() => {});
			const listener2 = mock(() => {});

			emitter.on("event", listener1);
			emitter.on("event", listener2);

			emitter.emit("event", EventCode.IN_CALL);

			expect(listener1).toHaveBeenCalledTimes(1);
			expect(listener2).toHaveBeenCalledTimes(1);
		});

		it("should allow listeners to capture screenshots on status change", async () => {
			const screenshotCapture = mock((_eventCode: EventCode) => {});

			emitter.on("event", (eventCode: EventCode) => {
				if (STATUS_EVENT_CODES.includes(eventCode)) {
					screenshotCapture(eventCode);
				}
			});

			emitter.emit("event", EventCode.IN_CALL);
			emitter.emit("event", EventCode.PARTICIPANT_JOIN);
			emitter.emit("event", EventCode.CALL_ENDED);

			expect(screenshotCapture).toHaveBeenCalledTimes(2);
			expect(screenshotCapture).toHaveBeenNthCalledWith(1, EventCode.IN_CALL);
			expect(screenshotCapture).toHaveBeenNthCalledWith(
				2,
				EventCode.CALL_ENDED,
			);
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Scenario 7: Full Bot Lifecycle Flow
	// ─────────────────────────────────────────────────────────────────────────

	describe("Scenario 7: Full bot lifecycle flow", () => {
		it("should handle complete bot lifecycle", async () => {
			const stateChanges: Array<{ newState: string; oldState: string }> = [];

			emitter.on("stateChange", (newState: string, oldState: string) => {
				stateChanges.push({ newState, oldState });
			});

			// Simulate full bot lifecycle
			emitter.emit("event", EventCode.JOINING_CALL);
			await Promise.resolve();
			expect(emitter.getState()).toBe(EventCode.JOINING_CALL);

			emitter.emit("event", EventCode.IN_WAITING_ROOM);
			await Promise.resolve();
			expect(emitter.getState()).toBe(EventCode.IN_WAITING_ROOM);

			emitter.emit("event", EventCode.IN_CALL);
			await Promise.resolve();
			expect(emitter.getState()).toBe(EventCode.IN_CALL);

			// Non-status events during call
			emitter.emit("event", EventCode.PARTICIPANT_JOIN);
			await Promise.resolve();
			expect(emitter.getState()).toBe(EventCode.IN_CALL); // State unchanged

			emitter.emit("event", EventCode.CALL_ENDED);
			await Promise.resolve();
			expect(emitter.getState()).toBe(EventCode.CALL_ENDED);

			emitter.emit("event", EventCode.DONE);
			await Promise.resolve();
			expect(emitter.getState()).toBe(EventCode.DONE);

			// Verify state change sequence
			expect(stateChanges).toEqual([
				{ newState: EventCode.JOINING_CALL, oldState: "INITIALIZING" },
				{
					newState: EventCode.IN_WAITING_ROOM,
					oldState: EventCode.JOINING_CALL,
				},
				{ newState: EventCode.IN_CALL, oldState: EventCode.IN_WAITING_ROOM },
				{ newState: EventCode.CALL_ENDED, oldState: EventCode.IN_CALL },
				{ newState: EventCode.DONE, oldState: EventCode.CALL_ENDED },
			]);

			// Wait for all backend calls
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Verify backend was called for each event
			expect(mockTrpc.bots.events.report.mutate).toHaveBeenCalledTimes(6);
			// Status updates only for status events (5 status + 1 non-status)
			expect(mockTrpc.bots.updateStatus.mutate).toHaveBeenCalledTimes(5);
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Scenario 8: Error/Fatal Flow
	// ─────────────────────────────────────────────────────────────────────────

	describe("Scenario 8: Error/Fatal flow", () => {
		it("should handle FATAL event with error data", async () => {
			const stateChangeListener = mock(() => {});
			emitter.on("stateChange", stateChangeListener);

			emitter.emit("event", EventCode.FATAL, {
				message: "Browser crashed",
				sub_code: "BROWSER_CRASH",
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(emitter.getState()).toBe(EventCode.FATAL);
			expect(stateChangeListener).toHaveBeenCalledWith(
				EventCode.FATAL,
				"INITIALIZING",
			);
			expect(mockTrpc.bots.events.report.mutate).toHaveBeenCalledWith({
				id: "123",
				event: {
					eventType: EventCode.FATAL,
					eventTime: expect.any(Date),
					data: {
						description: "Browser crashed",
						sub_code: "BROWSER_CRASH",
					},
				},
			});
		});
	});
});
