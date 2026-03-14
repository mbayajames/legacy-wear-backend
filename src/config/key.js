// config/key.js
// Main configuration file for the Legacy Wear e-commerce application
// Centralizes all environment variables and application settings

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file located in the project root
dotenv.config({ path: path.join(__dirname, '../../.env') });

// ==================== SERVER CONFIGURATION ====================
// Contains all server-related settings and environment detection
const SERVER = {
  // Application environment (development, production, test)
  NODE_ENV: process.env.NODE_ENV || 'development',
  // Port number the server will listen on
  PORT: parseInt(process.env.PORT, 10) || 5000,
  // Domain name for the application
  DOMAIN: process.env.DOMAIN || 'localhost',
  // Frontend application URL (for CORS and redirects)
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  // Backend API URL (constructed from environment or default)
  API_URL: process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`,
  
  // Boolean flags for easy environment checking
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_TEST: process.env.NODE_ENV === 'test',
  
  // List of allowed origins for CORS (prevents unauthorized cross-origin requests)
  ALLOWED_ORIGINS: [
    'http://localhost:5173',  // Vite default dev server
    'http://localhost:3000',  // Alternative dev port
    'https://legacy-wear.vercel.app',  // Production frontend
    process.env.FRONTEND_URL  // Dynamically add from env
  ].filter(Boolean)  // Remove any undefined/null values
};

// ==================== DATABASE CONFIGURATION ====================
// MongoDB connection settings
const DATABASE = {
  // Database connection string - use environment variable or fallback to local
  URI: process.env.MONGODB_URI || `mongodb://localhost:27017/legacywear_${SERVER.NODE_ENV}`,
  
  // MongoDB driver options for connection behavior
  OPTIONS: {
    useNewUrlParser: true,  // Use new MongoDB connection string parser
    useUnifiedTopology: true,  // Use new topology engine
    autoIndex: !SERVER.IS_PRODUCTION,  // Auto-create indexes only in dev (for performance)
    serverSelectionTimeoutMS: 5000,  // Timeout for server selection (5 seconds)
    socketTimeoutMS: 45000,  // Socket timeout (45 seconds)
    family: 4  // Use IPv4, skip IPv6
  },
  
  // Helper method to get connection string
  getConnectionString: () => process.env.MONGODB_URI || DATABASE.URI
};

// ==================== JWT CONFIGURATION ====================
// JSON Web Token settings for authentication
const JWT = {
  // Secret key for signing access tokens
  SECRET: process.env.JWT_SECRET || 'your-jwt-secret-key-must-be-changed-in-production',
  // Separate secret for refresh tokens (enhanced security)
  REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-must-be-changed',
  // Access token expiration time
  EXPIRES_IN: process.env.JWT_EXPIRES_IN || '90d',
  // Refresh token expiration (longer-lived)
  REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '180d',
  // Cookie expiration in days
  COOKIE_EXPIRES_IN: parseInt(process.env.JWT_COOKIE_EXPIRES_IN, 10) || 90,
  
  // Generate cookie options for storing JWT
  getCookieOptions: () => ({
    expires: new Date(Date.now() + JWT.COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000), // Convert days to ms
    httpOnly: true,  // Prevent JavaScript access (XSS protection)
    secure: SERVER.IS_PRODUCTION,  // HTTPS only in production
    sameSite: SERVER.IS_PRODUCTION ? 'none' : 'lax',  // CSRF protection
    domain: SERVER.IS_PRODUCTION ? SERVER.DOMAIN : undefined,  // Set domain in production
    path: '/'  // Cookie valid for entire site
  }),
  
  // JWT signing options
  getSignOptions: () => ({
    expiresIn: JWT.EXPIRES_IN,
    algorithm: 'HS256'  // HMAC-SHA256 signing algorithm
  })
};

// ==================== SESSION CONFIGURATION ====================
// Session management settings (alternative to JWT)
const SESSION = {
  // Secret for signing session IDs
  SECRET: process.env.SESSION_SECRET || 'your-session-secret-key',
  // Name of the session cookie
  NAME: 'legacywear.sid',
  // Session TTL in seconds (14 days)
  TTL: 14 * 24 * 60 * 60,
  
  // Generate session options for express-session
  getOptions: (mongoStore) => ({
    secret: SESSION.SECRET,
    resave: false,  // Don't save unchanged sessions
    saveUninitialized: false,  // Don't create session until something stored
    name: SESSION.NAME,
    store: mongoStore,  // Use MongoDB for session storage
    cookie: {
      secure: SERVER.IS_PRODUCTION,
      httpOnly: true,
      maxAge: SESSION.TTL * 1000,  // Convert to milliseconds
      sameSite: SERVER.IS_PRODUCTION ? 'none' : 'lax',
      domain: SERVER.IS_PRODUCTION ? SERVER.DOMAIN : undefined
    },
    rolling: true  // Reset cookie maxAge on each response
  })
};

// ==================== OAUTH CONFIGURATION ====================
// Social authentication providers configuration
const OAUTH = {
  // Google OAuth 2.0 settings
  GOOGLE: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    CALLBACK_URL: `${SERVER.API_URL}/api/auth/google/callback`,  // OAuth redirect URL
    SCOPES: ['profile', 'email'],  // Requested permissions
    PROMPT: 'select_account',  // Force account selection
    
    // Check if Google OAuth is properly configured
    isConfigured: () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  },
  
  // Facebook OAuth settings
  FACEBOOK: {
    CLIENT_ID: process.env.FACEBOOK_CLIENT_ID,
    CLIENT_SECRET: process.env.FACEBOOK_CLIENT_SECRET,
    CALLBACK_URL: `${SERVER.API_URL}/api/auth/facebook/callback`,
    PROFILE_FIELDS: ['id', 'displayName', 'email', 'photos'],  // Requested user data
    
    isConfigured: () => !!(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET)
  }
};

// ==================== EMAIL CONFIGURATION ====================
// Nodemailer configuration for sending emails
const EMAIL = {
  HOST: process.env.EMAIL_HOST || 'smtp.gmail.com',  // SMTP server
  PORT: parseInt(process.env.EMAIL_PORT, 10) || 587,  // SMTP port (587 for TLS)
  USERNAME: process.env.EMAIL_USERNAME,  // SMTP auth username
  PASSWORD: process.env.EMAIL_PASSWORD,  // SMTP auth password
  FROM: process.env.EMAIL_FROM || 'Legacy Wear <noreply@legacywear.com>',  // Default sender
  
  // Create nodemailer transport configuration
  getTransporterConfig: () => {
    // If email not configured, use ethereal.email for testing
    if (!EMAIL.USERNAME || !EMAIL.PASSWORD) {
      console.warn('⚠️ Email credentials not configured. Using ethereal.email for testing.');
      return {
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: 'ethereal.user@ethereal.email',
          pass: 'ethereal-password'
        }
      };
    }
    
    // Production email configuration
    return {
      host: EMAIL.HOST,
      port: EMAIL.PORT,
      secure: EMAIL.PORT === 465,  // true for port 465 (SSL)
      auth: {
        user: EMAIL.USERNAME,
        pass: EMAIL.PASSWORD
      },
      tls: {
        rejectUnauthorized: !SERVER.IS_DEVELOPMENT  // Accept self-signed certs in dev
      }
    };
  },
  
  // Directory containing email templates
  TEMPLATES_DIR: path.join(__dirname, '../utils/emailTemplates')
};

// ==================== CLOUDINARY CONFIGURATION ====================
// Cloudinary image storage and transformation settings
const CLOUDINARY = {
  CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  API_KEY: process.env.CLOUDINARY_API_KEY,
  API_SECRET: process.env.CLOUDINARY_API_SECRET,
  
  // Default upload options
  UPLOAD_OPTIONS: {
    folder: 'legacy-wear',  // Cloudinary folder name
    use_filename: true,  // Use original filename
    unique_filename: true,  // Ensure uniqueness
    overwrite: false,  // Don't overwrite existing files
    resource_type: 'auto'  // Auto-detect file type
  },
  
  // Predefined image transformations for different use cases
  TRANSFORMATIONS: {
    product: 'w_500,h_500,c_fill',  // Product images (fill crop)
    thumbnail: 'w_200,h_200,c_fill',  // Thumbnails
    banner: 'w_1200,h_400,c_fill',  // Banner images
    avatar: 'w_150,h_150,c_fill'  // User avatars
  },
  
  // Check if Cloudinary is configured
  isConfigured: () => !!(process.env.CLOUDINARY_CLOUD_NAME && 
                        process.env.CLOUDINARY_API_KEY && 
                        process.env.CLOUDINARY_API_SECRET)
};

// ==================== PAYMENT CONFIGURATION ====================
// Payment gateway configurations
const PAYMENT = {
  // Stripe payment settings
  STRIPE: {
    SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,  // For verifying webhook events
    CURRENCY: 'kes',  // Kenyan Shilling
    TAX_RATE: 0.16,  // 16% VAT
    
    isConfigured: () => !!process.env.STRIPE_SECRET_KEY
  },
  
  // M-Pesa mobile money settings (Kenya)
  MPESA: {
    CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
    CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
    PASSKEY: process.env.MPESA_PASSKEY,  // Lipa Na M-Pesa Online passkey
    SHORTCODE: process.env.MPESA_SHORTCODE || '174379',  // Business shortcode
    ENVIRONMENT: process.env.MPESA_ENVIRONMENT || 'sandbox',  // sandbox or production
    
    // Get M-Pesa API endpoints based on environment
    getAPIUrls: () => {
      const baseURL = PAYMENT.MPESA.ENVIRONMENT === 'production' 
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';
      
      return {
        oauth: `${baseURL}/oauth/v1/generate?grant_type=client_credentials`,
        stkPush: `${baseURL}/mpesa/stkpush/v1/processrequest`,  // STK Push
        query: `${baseURL}/mpesa/stkpushquery/v1/query`,  // Query transaction status
        register: `${baseURL}/mpesa/c2b/v1/registerurl`  // Register C2B URLs
      };
    },
    
    isConfigured: () => !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET)
  }
};

// ==================== RATE LIMITING ====================
// Rate limiting to prevent abuse
const RATE_LIMIT = {
  // Global rate limit settings
  WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW, 10) * 60 * 1000 || 15 * 60 * 1000,  // 15 minutes
  MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,  // Max 100 requests per window
  
  // Endpoint-specific rate limits
  ENDPOINTS: {
    auth: {  // Authentication endpoints (stricter limits)
      windowMs: 15 * 60 * 1000,  // 15 minutes
      max: 5,  // Max 5 attempts
      message: 'Too many authentication attempts. Please try again later.'
    },
    api: {  // General API endpoints
      windowMs: 60 * 60 * 1000,  // 1 hour
      max: 1000,  // Max 1000 requests
      message: 'Rate limit exceeded. Please slow down.'
    },
    upload: {  // File upload endpoints
      windowMs: 60 * 60 * 1000,  // 1 hour
      max: 50,  // Max 50 uploads
      message: 'Upload limit reached. Try again later.'
    }
  }
};

// ==================== FILE UPLOAD ====================
// File upload configuration
const UPLOAD = {
  MAX_SIZE: 5 * 1024 * 1024,  // Maximum file size: 5MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],  // Allowed MIME types
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],  // Allowed file extensions
  MAX_FILES: 10,  // Maximum files per upload
  
  // Upload directory paths
  PATHS: {
    TEMP: path.join(__dirname, '../../public/uploads/temp'),  // Temporary storage
    PERMANENT: path.join(__dirname, '../../public/uploads'),  // Permanent storage
    PRODUCTS: 'products',  // Subfolder for products
    AVATARS: 'avatars',  // Subfolder for avatars
    CATEGORIES: 'categories'  // Subfolder for category images
  },
  
  // Generate multer configuration for file uploads
  getMulterConfig: (destination = 'general') => ({
    limits: { fileSize: UPLOAD.MAX_SIZE },
    fileFilter: (req, file, cb) => {
      if (UPLOAD.ALLOWED_TYPES.includes(file.mimetype)) {
        cb(null, true);  // Accept file
      } else {
        cb(new Error(`Invalid file type. Allowed: ${UPLOAD.ALLOWED_TYPES.join(', ')}`), false);  // Reject
      }
    }
  })
};

// ==================== SECURITY ====================
// Security-related configurations
const SECURITY = {
  BCRYPT_ROUNDS: 12,  // Cost factor for password hashing
  PASSWORD_MIN_LENGTH: 8,  // Minimum password length
  
  // CORS (Cross-Origin Resource Sharing) options
  getCorsOptions: () => ({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps) or from allowed origins
      if (!origin || SERVER.ALLOWED_ORIGINS.includes(origin) || SERVER.IS_DEVELOPMENT) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy violation'), false);
      }
    },
    credentials: true,  // Allow cookies to be sent
    exposedHeaders: ['set-cookie', 'Authorization'],  // Headers exposed to client
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']  // Allowed request headers
  }),
  
  // Helmet.js configuration for security headers
  HELMET_OPTIONS: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],  // Default: only own domain
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],  // CSS sources
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  // JavaScript sources
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://lh3.googleusercontent.com'],  // Image sources
        connectSrc: ["'self'", SERVER.API_URL, SERVER.FRONTEND_URL],  // API connection sources
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],  // Font sources
        objectSrc: ["'none'"],  // No plugins (Flash, etc.)
        upgradeInsecureRequests: []  // Upgrade HTTP to HTTPS
      }
    },
    crossOriginEmbedderPolicy: false,  // Disable COEP for compatibility
    crossOriginResourcePolicy: { policy: "cross-origin" }  // Allow cross-origin resource loading
  }
};

// ==================== ADMIN CONFIGURATION ====================
// Admin user and permissions settings
const ADMIN = {
  DEFAULT_EMAIL: process.env.ADMIN_EMAIL || 'admin@legacywear.com',  // Default admin email
  DEFAULT_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@123',  // Default admin password
  SUPER_ADMINS: (process.env.SUPER_ADMINS || '').split(',').filter(email => email),  // List of super admin emails
  
  // Role-based permissions
  PERMISSIONS: {
    'user': ['read:own', 'update:own'],  // Regular users
    'admin': ['read:any', 'update:any', 'delete:any', 'create:any'],  // Admins
    'super-admin': ['*']  // Super admins (wildcard = all permissions)
  }
};

// ==================== CACHING ====================
// Caching configuration
const CACHE = {
  TTL: 60 * 60 * 1000,  // Default TTL: 1 hour in milliseconds
  CHECK_PERIOD: 60 * 60 * 1000,  // Check for expired entries every hour
  
  // Redis cache settings
  REDIS: {
    HOST: process.env.REDIS_HOST || 'localhost',
    PORT: parseInt(process.env.REDIS_PORT, 10) || 6379,
    PASSWORD: process.env.REDIS_PASSWORD,
    
    isConfigured: () => !!process.env.REDIS_HOST
  }
};

// ==================== LOGGING ====================
// Logging configuration
const LOGGING = {
  // Log level based on environment
  LEVEL: SERVER.IS_PRODUCTION ? 'info' : 'debug',
  // Morgan log format
  FORMAT: SERVER.IS_PRODUCTION ? 'combined' : 'dev',
  
  // Get morgan format string
  getMorganFormat: () => {
    return SERVER.IS_PRODUCTION
      ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
      : 'dev';  // Concise colored output for development
  }
};

// ==================== VALIDATION ====================
// Input validation rules and sanitization
const VALIDATION = {
  // Password must contain at least: 1 lowercase, 1 uppercase, 1 number, min 8 chars
  PASSWORD_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d\w\W]{8,}$/,
  // Basic email format validation
  EMAIL_REGEX: /^\S+@\S+\.\S+$/,
  // Kenyan phone number format (+254XXXXXXXXX or 07XXXXXXXX)
  PHONE_REGEX: /^(\+254|0)[7][0-9]{8}$/,
  
  // HTML sanitization options (remove all HTML tags)
  SANITIZE_OPTIONS: {
    ALLOWED_TAGS: [],  // No HTML tags allowed
    ALLOWED_ATTR: [],  // No attributes allowed
    STRIP_CDATA: true  // Remove CDATA sections
  }
};

// ==================== FEATURE TOGGLES ====================
// Feature flags to enable/disable functionality
const FEATURES = {
  // Features enabled based on configuration
  ENABLED: {
    GOOGLE_AUTH: OAUTH.GOOGLE.isConfigured(),
    FACEBOOK_AUTH: OAUTH.FACEBOOK.isConfigured(),
    STRIPE_PAYMENTS: PAYMENT.STRIPE.isConfigured(),
    MPESA_PAYMENTS: PAYMENT.MPESA.isConfigured(),
    CLOUDINARY_UPLOADS: CLOUDINARY.isConfigured(),
    EMAIL_SERVICE: !!(EMAIL.USERNAME && EMAIL.PASSWORD),
    WISHLIST: true,  // Always enabled
    REVIEWS: true,  // Always enabled
    INVENTORY_TRACKING: true  // Always enabled
  },
  
  // Manual feature toggles
  TOGGLES: {
    MAINTENANCE_MODE: false,  // Set true to disable site for maintenance
    DEBUG_MODE: SERVER.IS_DEVELOPMENT,  // Enable debugging in dev
    DEMO_MODE: process.env.DEMO_MODE === 'true'  // Demo mode (read-only)
  }
};

// ==================== VALIDATION FUNCTION ====================
// Validates configuration on startup and reports errors/warnings
const validateConfig = () => {
  const errors = [];
  const warnings = [];

  // Production-specific required settings
  if (SERVER.IS_PRODUCTION) {
    // Check for default/unsafe secrets in production
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-jwt-secret-key-must-be-changed-in-production') {
      errors.push('JWT_SECRET must be set in production');
    }
    
    if (!process.env.MONGODB_URI) {
      errors.push('MONGODB_URI must be set in production');
    }
    
    if (!process.env.SESSION_SECRET) {
      errors.push('SESSION_SECRET must be set in production');
    }
  }

  // Warning for missing optional features
  if (!OAUTH.GOOGLE.isConfigured()) {
    warnings.push('Google OAuth is not configured - social login will be disabled');
  }
  
  if (!PAYMENT.STRIPE.isConfigured() && !PAYMENT.MPESA.isConfigured()) {
    warnings.push('No payment gateway configured - checkout will be disabled');
  }
  
  if (!EMAIL.USERNAME || !EMAIL.PASSWORD) {
    warnings.push('Email service not configured - using ethereal.email for testing');
  }

  return { errors, warnings };
};

// ==================== EXPORT ====================
// Export all configuration objects for use throughout the application
module.exports = {
  SERVER,
  DATABASE,
  JWT,
  SESSION,
  OAUTH,
  EMAIL,
  CLOUDINARY,
  PAYMENT,
  RATE_LIMIT,
  UPLOAD,
  SECURITY,
  ADMIN,
  CACHE,
  LOGGING,
  VALIDATION,
  FEATURES,
  validateConfig
};