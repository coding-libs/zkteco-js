/**
 *
 * Author: coding-libs
 * Date: 2024-07-01
 */

const Zkteco = require("../index");

const test = async () => {
    let zkInstance;
    try {
        // Create an instance of Zkteco with hard-coded values
        zkInstance = new Zkteco('192.168.0.207', 4370, 10000, 4000);

        // Create socket to machine
        await zkInstance.createSocket();

        // Get general info like logCapacity, user counts, logs count
        const capacityInfo = await zkInstance.getInfo();

        // Get attendances and users
        const attendances = await zkInstance.getAttendances();

        const users = await zkInstance.getUsers();

        await zkInstance.voiceTest();

    } catch (e) {
        // Log the error for debugging
        console.error('An error occurred:', e);
    } finally {
        // Ensure the socket is closed
        if (zkInstance) {
            try {
                await zkInstance.disconnect();
            } catch (closeError) {
                console.error('Error closing the socket:', closeError);
            }
        }
    }
}

test().catch(err => {
    // Handle any uncaught errors from the test function
    console.error('Unhandled error in test function:', err);
});
