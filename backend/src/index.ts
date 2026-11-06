import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth.routes.js';
import accountsRoutes from './routes/accounts.routes.js';
import transfersRoutes from './routes/transfers.routes.js';
import auditRoutes from './routes/audit.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api', transfersRoutes);
app.use('/api/audit', auditRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'UP',
        system: 'LedgerLine Integrity & Money Movement Engine',
        timestamp: new Date().toISOString()
    });
});

// Serve frontend static build if present
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
    console.log(`[LEDGERLINE] Serving frontend static assets from: ${frontendDistPath}`);
    app.use(express.static(frontendDistPath));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
            return next();
        }
        res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
}

import { runSeed } from './db/seed.js';

// Centralized error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[SERVER_ERROR]', err);
    res.status(500).json({
        error: err.message || 'Internal server error occurred'
    });
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, async () => {
        console.log(`[LEDGERLINE] Server actively listening on port ${PORT}`);
        try {
            await runSeed();
        } catch (e: any) {
            console.error('[AUTO_SEED_ERROR]', e.message);
        }
    });
}

export default app;
