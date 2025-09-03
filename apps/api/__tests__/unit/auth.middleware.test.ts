/**
 * Auth Middleware Unit Tests
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../../src/middleware/auth';

// Mock jwt
jest.mock('jsonwebtoken');
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('Auth Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = {
            headers: {},
            user: undefined
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        mockNext = jest.fn();
    });

    describe('when token is valid', () => {
        it('should set user and call next', async () => {
            const mockUser = { id: 'user123', email: 'test@example.com' };
            mockReq.headers!.authorization = 'Bearer validtoken';
            mockJwt.verify.mockReturnValue(mockUser as any);

            await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockReq.user).toEqual(mockUser);
            expect(mockNext).toHaveBeenCalled();
        });
    });

    describe('when token is missing', () => {
        it('should return 401 unauthorized', async () => {
            await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Access token required'
                }
            });
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('when token is invalid', () => {
        it('should return 401 unauthorized', async () => {
            mockReq.headers!.authorization = 'Bearer invalidtoken';
            mockJwt.verify.mockImplementation(() => {
                throw new Error('Invalid token');
            });

            await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Invalid access token'
                }
            });
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('when token is expired', () => {
        it('should return 401 token expired', async () => {
            mockReq.headers!.authorization = 'Bearer expiredtoken';
            const error = new Error('Token expired');
            error.name = 'TokenExpiredError';
            mockJwt.verify.mockImplementation(() => {
                throw error;
            });

            await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'TOKEN_EXPIRED',
                    message: 'Access token expired'
                }
            });
        });
    });
});
