// config/db.js
// Database connection configuration and management module
// Handles MongoDB connection setup, event listeners, and graceful shutdown

const mongoose = require('mongoose');
const { DATABASE, SERVER } = require('./key');

/**
 * Establishes connection to MongoDB database
 * @async
 * @function connectDB
 * @returns {Promise<void>}
 */
const connectDB = async () => {
  try {
    /**
     * Establish MongoDB connection using Mongoose
     * getConnectionString() - Retrieves MongoDB URI from config (environment or default)
     * DATABASE.OPTIONS - Contains connection options like timeouts, parser settings
     */
    const conn = await mongoose.connect(
      DATABASE.getConnectionString(),  // Get connection string from config
      DATABASE.OPTIONS                  // Apply database connection options
    );
    
    // Log successful connection with host information
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    /**
     * Monitor MongoDB connection for runtime errors
     * This listener catches any errors that occur after initial connection
     * Useful for handling network issues, authentication failures, etc.
     */
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    /**
     * Monitor for disconnection events
     * This can happen due to network issues, server restart, or timeout
     * Provides warning without crashing the application
     */
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });
    
    /**
     * Graceful shutdown handler for application termination
     * Listens for SIGINT signal (Ctrl+C, or process termination)
     * Ensures all pending database operations complete before closing
     */
    process.on('SIGINT', async () => {
      try {
        // Close all MongoDB connections gracefully
        await mongoose.connection.close();
        console.log('MongoDB connection closed through app termination');
        // Exit process successfully after cleanup
        process.exit(0);
      } catch (err) {
        console.error('Error during graceful shutdown:', err);
        process.exit(1);
      }
    });
    
  } catch (error) {
    /**
     * Handle initial connection failures
     * Common issues: MongoDB not running, wrong URI, network problems
     * Log error and exit process as database is critical for application
     */
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

// Export the connection function for use in main application file
module.exports = connectDB;