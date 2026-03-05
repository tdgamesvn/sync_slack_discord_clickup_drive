const jwt = require('jsonwebtoken');

// Secret key for JWT — MUST be set in .env
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET is not set in .env — server cannot start securely.');
    process.exit(1);
}

function authMiddleware(req, res, next) {
    // Exclude login route
    if (req.path === '/login') {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, username, name }
        next();
    } catch (err) {
        console.error('JWT Verification Error:', err.message);
        return res.status(401).json({ error: 'Unauthorized: Token expired or invalid' });
    }
}

module.exports = { authMiddleware, JWT_SECRET };
