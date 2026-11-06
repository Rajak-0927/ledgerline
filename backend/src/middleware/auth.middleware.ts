import { Request, Response, NextFunction } from 'express';
import { AuthService, UserTokenPayload } from '../services/auth.service.js';

export interface AuthenticatedRequest extends Request {
    user?: UserTokenPayload;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'UNAUTHORIZED: Missing or malformed Bearer token' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = AuthService.verifyToken(token);
        req.user = decoded;
        next();
    } catch (err: any) {
        return res.status(401).json({ error: 'UNAUTHORIZED: Invalid or expired token' });
    }
}

export function requireRole(...allowedRoles: Array<'ADMIN' | 'ACCOUNT_HOLDER' | 'AUDITOR'>) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'UNAUTHORIZED: Authentication required' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `FORBIDDEN: Endpoint requires role [${allowedRoles.join(', ')}], current role is '${req.user.role}'`
            });
        }

        next();
    };
}
