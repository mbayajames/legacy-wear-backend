const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

module.exports = (passport) => {
  // JWT Strategy
  const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET,
  };

  passport.use(
    new JwtStrategy(jwtOptions, async (jwt_payload, done) => {
      try {
        const user = await User.findById(jwt_payload.id).select('-password');
        
        if (user) {
          return done(null, user);
        }
        return done(null, false);
      } catch (error) {
        console.error(error);
        return done(error, false);
      }
    })
  );

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            // Check if user already exists
            let user = await User.findOne({ 
              $or: [
                { googleId: profile.id },
                { email: profile.emails[0].value }
              ]
            });

            if (user) {
              // Update Google ID if user exists but didn't have it
              if (!user.googleId) {
                user.googleId = profile.id;
                user.isVerified = true;
                await user.save();
              }
              return done(null, user);
            }

            // Create new user
            user = await User.create({
              googleId: profile.id,
              email: profile.emails[0].value,
              name: profile.displayName,
              firstName: profile.name.givenName,
              lastName: profile.name.familyName,
              avatar: profile.photos[0]?.value,
              isVerified: true,
              authProvider: 'google',
            });

            done(null, user);
          } catch (error) {
            console.error('Google Strategy Error:', error);
            done(error, false);
          }
        }
      )
    );
  }
};