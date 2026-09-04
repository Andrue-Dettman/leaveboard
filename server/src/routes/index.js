import { Router } from 'express';
import { balancesRouter } from './balances.js';
import { businessDaysRouter } from './businessDays.js';
import { healthRouter } from './health.js';
import { holidaysRouter } from './holidays.js';
import { leaveTypesRouter } from './leaveTypes.js';
import { usersRouter } from './users.js';

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(usersRouter);
apiRouter.use(leaveTypesRouter);
apiRouter.use(holidaysRouter);
apiRouter.use(businessDaysRouter);
apiRouter.use(balancesRouter);
