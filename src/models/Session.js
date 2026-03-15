// models/Session.js
// Session model for MongoDB - stores user session data for express-session with connect-mongo
// Uses MongoDB's TTL (Time-To-Live) feature for automatic session cleanup

const mongoose = require('mongoose');  // MongoDB ODM for schema definition

/**
 * Session Schema Definition
 * Designed to work with connect-mongo (MongoDB session store for express-session)
 * Follows the exact structure required by the session store
 */
const sessionSchema = new mongoose.Schema({
  // ========== SESSION ID ==========
  // Custom _id field to store the session ID string
  // connect-mongo expects _id to be the session ID, not an ObjectId
  _id: String,  // Session ID (usually a random string like "sess:abc123")
  
  // ========== SESSION DATA ==========
  // The actual session data (serialized by express-session)
  // Contains user ID, cart data, etc. when user is logged in
  session: {
    type: mongoose.Schema.Types.Mixed,  // Can store any JSON-serializable data
    required: true                        // Session must have data
  },
  
  // ========== EXPIRATION ==========
  // When this session expires
  // MongoDB will automatically delete documents when this date is reached
  expires: {
    type: Date,
    required: true,
    index: { expires: 0 }  // TTL index - tells MongoDB to delete expired docs
  }
  
}, {
  // Schema options
  timestamps: true,        // Adds createdAt and updatedAt fields
  collection: 'sessions'   // Explicitly name the collection 'sessions'
});

// ========== INDEXES ==========
/**
 * TTL (Time-To-Live) Index
 * This is the critical part for automatic session cleanup
 * 
 * `expireAfterSeconds: 0` means documents are deleted immediately
 * when `expires` date is passed
 * 
 * Example:
 * - If expires is set to "2024-03-15T10:00:00Z"
 * - At "2024-03-15T10:00:01Z", MongoDB automatically deletes it
 */
sessionSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });

// Create and export the Session model
module.exports = mongoose.model('Session', sessionSchema);