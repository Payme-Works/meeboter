# Live Boost Lab - Google Meet Bot Orchestrator

A sophisticated bot orchestration system that can deploy multiple independent Google Meet bots with realistic names, using clean architecture and OOP principles.

## Features

- **Clean Architecture**: Separation of concerns with interfaces, services, and domain models
- **OOP Design**: Object-oriented implementation following SOLID principles  
- **Error Handling**: Comprehensive error handling with custom error types and logging
- **Type Safety**: Full TypeScript support with proper type definitions
- **Browser Automation**: Uses Playwright with stealth plugin to avoid detection
- **Bot Orchestration**: Deploy multiple independent bots with staggered timing
- **Realistic Bot Names**: 50+ diverse, professional-sounding names for natural appearance
- **Independent Instances**: Each bot runs in its own browser instance with isolated state
- **Media Control**: Automatically disables camera and microphone before joining meetings
- **Privacy-First**: Denies media permissions at browser level for enhanced privacy
- **Permission Dialog Handling**: Automatically handles Google Meet permission dialogs by choosing "Continue without microphone and camera"
- **Real-time Monitoring**: Live orchestration events and statistics tracking

## Architecture

```
src/
├── bots/                    # Bot implementations
│   └── google-meet-bot.ts   # Main Google Meet bot class
├── constants/               # Application constants
│   ├── bot-names.ts         # Realistic person names for bots
│   └── meet-selectors.ts    # Google Meet DOM selectors
├── errors/                  # Custom error classes
│   └── bot-error.ts         # Bot-specific error handling
├── interfaces/              # Interface definitions
│   └── bot.interface.ts     # Core bot and orchestrator interfaces
├── orchestration/           # Bot orchestration system
│   └── google-meet-orchestrator.ts  # Multi-bot orchestration
├── services/                # Service implementations
│   ├── browser-service.ts   # Browser management service
│   └── logger-service.ts    # Logging service
├── types/                   # Type definitions
│   ├── bot-config.ts        # Bot configuration and status types
│   └── orchestrator-config.ts  # Orchestration configuration types
└── index.ts                 # Main orchestrator entry point
```

## Usage

1. **Install dependencies**:
   ```bash
   cd /Users/andrevictor/www/HAT-CREW/meeting-bot
   pnpm install
   ```

2. **Install Playwright browsers**:
   ```bash
   cd apps/lab
   npx playwright install chromium
   ```

3. **Run the orchestrator**:
   ```bash
   pnpm run dev
   ```

The orchestrator will automatically:
- Deploy multiple bots with realistic names (David Thompson, Alex Morgan, Jordan Parker, etc.)
- **Stagger bot joins** with 8-second delays for natural appearance
- Launch independent Chromium browsers for each bot
- Navigate each bot to the Google Meet link: `https://meet.google.com/eqp-efzz-vhb`
- **Disable camera and microphone** for all bots before joining
- **Handle permission dialogs** by choosing "Continue without microphone and camera"
- Provide real-time orchestration events and statistics
- Stay connected until manually stopped (Ctrl+C)

## Configuration

The orchestrator can be configured through the `OrchestratorConfig` interface:

```typescript
const config: OrchestratorConfig = {
  meetingUrl: 'https://meet.google.com/eqp-efzz-vhb',
  botCount: 3,                 // Number of bots to deploy
  staggerDelay: 8000,          // 8 seconds between bot joins
  headless: false,             // Set to true for production
  baseBotConfig: {
    joinTimeout: 30000,        // 30 seconds
    waitingRoomTimeout: 60000, // 60 seconds
  },
  // Optional: provide custom bot names
  customBotNames: ['John Smith', 'Jane Doe', 'Mike Johnson']
};
```

## Bot Status Flow

1. **IDLE** → Initial state
2. **CONNECTING** → Browser launching and joining meeting
3. **JOINED** → Successfully joined the meeting
4. **LEFT** → Gracefully left the meeting
5. **KICKED** → Removed from meeting by host
6. **ERROR** → An error occurred

## Key Classes

### GoogleMeetOrchestrator
Main orchestration system that manages multiple bot instances with staggered deployment.

### GoogleMeetBot
Individual bot implementation that handles the complete meeting lifecycle.

### BrowserService  
Manages Playwright browser instances with stealth configuration.

### ConsoleLogger
Provides structured logging with different log levels (ERROR, WARN, INFO, DEBUG).

### BotError
Custom error class with specific error codes for different failure scenarios.

## Bot Names

The system includes 50+ realistic, diverse names:
- **American**: Sarah Johnson, Michael Chen, David Thompson
- **International**: Priya Patel, Alessandro Rossi, Yuki Tanaka
- **Professional**: Dr. Robert Kim, Prof. Lisa Chang
- **Tech-style**: Maya Singh, Ethan Clark, Zoe Bennett
- **Gender-neutral**: Alex Morgan, Taylor Swift, Jordan Parker

Names are automatically selected to avoid duplicates and provide natural variety.

## Error Handling

The bot includes comprehensive error handling for common scenarios:
- Browser launch failures
- Page navigation issues
- Join meeting timeouts
- Connection losses
- Being kicked from meetings

## Development

- **Headless Mode**: Set `headless: true` in config for production use
- **Logging**: Adjust log level in ConsoleLogger constructor for debugging
- **Timeouts**: Customize timeouts in bot configuration
- **Selectors**: Update selectors in `meet-selectors.ts` if Google Meet UI changes

## Future Enhancements

- Multiple bot instances
- Natural entry patterns (gradual joining)
- Recording capabilities
- Participant monitoring
- Dashboard integration
