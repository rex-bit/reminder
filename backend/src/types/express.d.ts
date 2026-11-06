import type { AdminContext } from '../modules/admins/admins.repo';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminContext;
    }
  }
}

export {};
