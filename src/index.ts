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

// Validate required environment variables on startup
function validateEnvironment() {
    const required = ['DATABASE_URL', 'GITHUB_WEBHOOK_SECRET'];
    const missing = required.filter(env => !process.env[env]);

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(env => console.error(`   - ${env}`));
        console.error('   Please check your .env.local file or environment configuration');
        process.exit(1);
    }

    console.log('✅ All required environment variables configured');
}

// Special middleware for webhook to preserve raw body for signature verification
app.use('/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
    // Convert raw buffer to JSON for processing, but keep raw body for signature verification
    req.body = JSON.parse(req.body.toString());
    next();
});

// Regular JSON parsing for other routes
app.use(express.json());

// Routes
app.post('/webhook', webhookHandler);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'svarnac-content-sync',
        security: {
            webhookSecretConfigured: !!process.env.GITHUB_WEBHOOK_SECRET
        }
    });
});

/**
 * Starts the server with proper error handling
 * Validates environment and database connection
 */
async function startServer() {
    try {
        // Validate environment variables first
        validateEnvironment();

        // Initialize database connection
        await createDbConnection();
        console.log('✅ Database connected successfully');

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`🔒 Webhook security: REQUIRED`);
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
