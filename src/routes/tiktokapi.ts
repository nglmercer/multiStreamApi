import { Elysia, t } from 'elysia';

// Placeholder for the actual service - will be moved/replaced later
const getOrCreatePlatformConnection = async (platform?: string, uniqueId?: string) => {
    console.log(`[Stub] getOrCreatePlatformConnection called with platform: ${platform}, uniqueId: ${uniqueId}`);
    if (!uniqueId) {
        // In a real scenario, Elysia's validation would catch this if `uniqueId` is non-optional
        throw new Error('UniqueId is required by stub');
    }
    return {
        getRoomInfo: async () => {
            console.log(`[Stub] getRoomInfo called for ${uniqueId}`);
            return {
                roomId: `stub_room_${uniqueId}`,
                title: `Stub Room for ${uniqueId}`,
                viewers: Math.floor(Math.random() * 1000),
                platform: platform || 'unknown',
            };
        }
    };
};

export const tiktokApiRoutes = new Elysia({ prefix: '/api' })
    .get('/getRoomInfo', async ({ query, set }) => {
        const { platform, uniqueId } = query;

        if (!uniqueId) {
            set.status = 400; // Bad Request
            return { error: 'uniqueId query parameter is required' };
        }

        try {
            const connectionPlatform = await getOrCreatePlatformConnection(platform, uniqueId);
            // The original code checked for connectionPlatform && connectionPlatform.getRoomInfo
            // Our stub directly provides it or throws.
            const roomInfo = await connectionPlatform.getRoomInfo();
            return roomInfo;
        } catch (error: any) {
            console.error('[tiktokApiRoutes] Error in /getRoomInfo:', error);
            set.status = 500; // Internal Server Error
            return { error: error.message || 'An unexpected error occurred' };
        }
    }, {
        query: t.Object({
            platform: t.Optional(t.String()),
            uniqueId: t.Optional(t.String()) // Will be checked manually for now, or make t.String() if always required
        })
    });
