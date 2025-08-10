// src/index.ts
/**
 * Main server entry point
 * Handles Express app setup and routes registration
 * Delegates business logic to service modules
 */
import express from 'express';
import { createDbConnection, closeDbConnection } from './db';
import { webhookHandler } from './services/webhook';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(express.json());

// Routes
app.post('/webhook', webhookHandler);

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'svarnac-content-sync'
    });
});

/**
 * Starts the server with proper error handling
 * Ensures database connection before accepting requests
 */
async function startServer() {
    try {
        // Initialize database connection first
        await createDbConnection();
        console.log('✅ Database connected successfully');

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

/**
 * Graceful shutdown handler
 * Ensures proper cleanup of resources
 */
async function gracefulShutdown() {
    console.log('🛑 Shutting down gracefully...');

    try {
        await closeDbConnection();
        console.log('💾 Database connection closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the application
startServer();
