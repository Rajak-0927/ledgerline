import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ledgerline_super_secret_jwt_key_2026';

export interface UserTokenPayload {
    id: string;
    email: string;
    role: 'ADMIN' | 'ACCOUNT_HOLDER' | 'AUDITOR';
    full_name: string;
}

export class AuthService {
    static async register(params: {
        email: string;
        password: string;
        fullName: string;
        role: 'ADMIN' | 'ACCOUNT_HOLDER' | 'AUDITOR';
    }) {
        const passwordHash = await bcrypt.hash(params.password, 10);
        const id = crypto.randomUUID();

        const res = await db.query(
            `INSERT INTO users (id, email, password_hash, role, full_name, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING id, email, role, full_name, created_at`,
            [id, params.email.toLowerCase(), passwordHash, params.role, params.fullName]
        );

        return res.rows[0];
    }

    static async login(email: string, password: string) {
        const res = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        if (res.rows.length === 0) {
            throw new Error('Invalid email or password');
        }

        const user = res.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            throw new Error('Invalid email or password');
        }

        const payload: UserTokenPayload = {
            id: user.id,
            email: user.email,
            role: user.role,
            full_name: user.full_name
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

        return {
            user: payload,
            token
        };
    }

    static verifyToken(token: string): UserTokenPayload {
        return jwt.verify(token, JWT_SECRET) as UserTokenPayload;
    }
}
