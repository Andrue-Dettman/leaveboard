import { Router } from 'express';
import { healthRouter } from './health.js';
import { holidaysRouter } from './holidays.js';
import { leaveTypesRouter } from './leaveTypes.js';
import { usersRouter } from './users.js';

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(usersRouter);
apiRouter.use(leaveTypesRouter);
apiRouter.use(holidaysRouter);
