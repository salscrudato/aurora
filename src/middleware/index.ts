/**
 * AuroraNotes API - Middleware Exports
 */

export {
  userAuthMiddleware,
  optionalAuthMiddleware,
  isUserAuthEnabled,
  AuthenticatedUser,
} from './userAuth';

export {
  validateBody,
  validateQuery,
  validateParams,
  ValidationError,
} from './validation';

export {
  perUserRateLimiter,
  createRateLimiter,
} from './rateLimiter';

export {
  audioUpload,
  getNormalizedMimeType,
  AudioUploadError,
  handleMulterError,
} from './audioUpload';
