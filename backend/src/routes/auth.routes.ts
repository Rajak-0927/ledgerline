import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(1),
    role: z.enum(['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR']).default('ACCOUNT_HOLDER')
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string()
});

router.post('/register', async (req, res) => {
    try {
        const body = registerSchema.parse(req.body);
        const user = await AuthService.register(body);
        res.status(201).json({ message: 'User registered successfully', user });
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Registration failed' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const body = loginSchema.parse(req.body);
        const session = await AuthService.login(body.email, body.password);
        res.json(session);
    } catch (err: any) {
        res.status(401).json({ error: err.message || 'Invalid credentials' });
    }
});

router.get('/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
});

export default router;
