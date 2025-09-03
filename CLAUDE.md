# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a browser-side log collection and reporting tool that supports multiple logging service backends including Alibaba Cloud Log Service (SLS) and Grafana Loki. The project provides a complete logging solution with client-side collection, service worker processing, and server-side forwarding.

## Common Commands

### Development Commands
```bash
# Build the entire project
pnpm build

# Development mode with watch
pnpm dev

# Run tests (currently no tests implemented)
pnpm test

# Clean build artifacts
pnpm clean

# Protocol buffer compilation (for SLS and common log formats)
pnpm proto:compile
```

### Build System
- Uses Rollup for bundling with multiple output formats (ESM, CommonJS)
- Builds both browser and server components
- Includes code obfuscation and minification
- Generates TypeScript declaration files

## Architecture

### Core Components

**Browser Client (logs/core/logs.js)**
- Main entry point providing log methods (trace, debug, info, warn, error)
- Uses loglevel library for consistent logging API
- Implements proxy pattern to intercept and forward logs
- Default log levels: WARN in browser, TRACE in Node.js (configurable via LOGS_LEVEL env var)

**Service Worker System**
- `browser/beacon.js` - Main thread script that registers Service Worker
- `browser/beacon-sw.js` - Service Worker for processing logs
- Handles log aggregation, compression, and batch sending
- Uses IndexedDB for persistent storage when offline

**Log Processing Pipeline**
- `common/LogProcessor.js` - Base class for log processing (deduplication, filtering)
- `common/LogAggregator.js` - Handles batch collection and sending
- `common/serializeLogContent.js` - Intelligent serialization of complex objects
- `common/LogStore.js` - IndexedDB storage for offline persistence

**Backend Integration**
- `sls/slsClient.js` - Alibaba Cloud Log Service integration
- `loki/lokiClient.js` - Grafana Loki integration
- Protocol buffer definitions for structured log formats

### Data Flow

1. **Application Code** → `log.info()` calls
2. **Core Module** → Intercepts and forwards to Service Worker
3. **Service Worker** → Aggregates, compresses, and stores logs
4. **Batch Sending** → Sends to `/api/beacon` endpoint on triggers:
   - Timer (default 5 minutes)
   - Data size threshold (default 3MB)
   - Page state changes (hide/unload)
5. **Server Handler** → Forwards to configured logging service (SLS/Loki)

### Export Structure

The package exports multiple entry points:
- `.` - Core logging functionality
- `./sls` - SLS client for server-side use
- `./sls/beacon` - SLS beacon script for browser
- `./sls/sw` - SLS service worker
- `./loki` - Loki client for server-side use
- `./loki/beacon` - Loki beacon script for browser
- `./loki/sw` - Loki service worker
- `./eslint` - ESLint plugin for console.log conversion
- `./dev-tools/log-filter` - Development filtering tool

## Key Features

- **Intelligent Deduplication**: Removes duplicate logs within 3-second windows
- **Smart Serialization**: Handles circular references and samples large arrays
- **Offline Support**: IndexedDB storage for reliable log delivery
- **Performance Optimized**: Batch processing and compression
- **Development Tools**: Runtime log filtering and level control
- **ESLint Integration**: Automatic console.log to log conversion

## Development Notes

- The project uses pnpm workspaces for monorepo management
- Service Worker scope must be `/beacon/` for proper registration
- Beacon scripts expect specific file locations and names
- Protocol buffer compilation required for SLS integration
- Default browser log level is WARN to keep console clean