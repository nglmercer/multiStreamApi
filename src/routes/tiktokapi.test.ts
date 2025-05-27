import { describe, it, expect } from 'bun:test';
import { Elysia } from 'elysia';
import { tiktokApiRoutes } from './tiktokapi'; // Adjust path as necessary

// Create a new Elysia instance specifically for testing
// and mount the routes you want to test.
const testApp = new Elysia().use(tiktokApiRoutes);

describe('TikTok API Routes - /api/getRoomInfo', () => {
    it('should return stubbed room info when uniqueId is provided', async () => {
        const uniqueId = 'testuser123';
        const platform = 'tiktok';
        const response = await testApp
            .handle(new Request(`http://localhost/api/getRoomInfo?uniqueId=${uniqueId}&platform=${platform}`))
            .then(res => res.json());

        expect(response.roomId).toBe(`stub_room_${uniqueId}`);
        expect(response.title).toBe(`Stub Room for ${uniqueId}`);
        expect(response.viewers).toBeTypeOf('number');
        expect(response.platform).toBe(platform);
    });

    it('should return a 400 error if uniqueId is missing', async () => {
        const response = await testApp
            .handle(new Request('http://localhost/api/getRoomInfo'))
            .then(res => {
                return { status: res.status, body: res.json() };
            });

        expect(response.status).toBe(400);
        const body = await response.body; // Resolve the promise for the body
        expect(body.error).toBe('uniqueId query parameter is required');
    });

    it('should handle the case where platform is not provided', async () => {
        const uniqueId = 'testuser_noplatform';
        const response = await testApp
            .handle(new Request(`http://localhost/api/getRoomInfo?uniqueId=${uniqueId}`))
            .then(res => res.json());

        expect(response.roomId).toBe(`stub_room_${uniqueId}`);
        expect(response.platform).toBe('unknown'); // As per our stub
    });
});
