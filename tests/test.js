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
        zkInstance = new Zkteco('192.168.86.23', 4370, 10000, 4000);
        // Create socket to machine
        await zkInstance.createSocket();

        // Get general info like logCapacity, user counts, logs count
        const getInfo = await zkInstance.getInfo();
        console.log("getInfo: ", getInfo);

        const getVendor = await zkInstance.getVendor();
        console.log('getVendor: '+getVendor);

        const getProductTime = await zkInstance.getProductTime();
        console.log('getProductTime: '+getProductTime);

        const getMacAddress = await zkInstance.getMacAddress();
        console.log('getMacAddress: '+getMacAddress);

        const serialNo = await zkInstance.getSerialNumber();
        console.log('getSerialNumber: '+serialNo);

        const DeviceVersion = await zkInstance.getDeviceName();
        console.log('getDeviceName: '+DeviceVersion);

        const getPlatform = await zkInstance.getPlatform();
        console.log('getPlatform: '+getPlatform);

        const getOS = await zkInstance.getOS();
        console.log('getOS: '+getPlatform);

        const getWorkCode = await zkInstance.getWorkCode();
        console.log('getWorkCode: '+getWorkCode);

        const getPIN = await zkInstance.getPIN();
        console.log('getPIN: '+getPIN);

        const getFaceOn = await zkInstance.getFaceOn();
        console.log('getFaceOn: '+getFaceOn);

        const getSSR = await zkInstance.getSSR();
        console.log('getSSR: '+getSSR);

        const getFirmware = await zkInstance.getFirmware();
        console.log('getFirmware: '+getFirmware);

        const getTime = await zkInstance.getTime();
        console.log('getTime: '+getTime);

        await zkInstance.setTime(getTime);
        console.log('setTime: '+getTime);

        await zkInstance.voiceTest();
        console.log('voiceTest');

        const deletedUser = await zkInstance.deleteUser(200);
        console.log('deletedUser', deletedUser);

        const username = `Test_${Date.now()}`
        await zkInstance.setUser('200','200', username, '123456');
        console.log('setUser:200');

        const usersData = await zkInstance.getUsers();
        console.log('getUsers: '+usersData.data.length);
        const addedUser = usersData.data.filter(function(item){
            return item.name == username
        })
        if(addedUser.length == 1){
            console.log('User add successfull')
        }

        await zkInstance.deleteUser(200);
        const _usersData = await zkInstance.getUsers();
        const _addedUser = _usersData.data.filter(function(item){
            return item.uid == 200
        })
        if(_addedUser.length == 0){
            console.log('User deleted successfull')
        }

        // Get attendances and users
        const attendances = await zkInstance.getAttendances();
        console.log("Total Attendances: "+attendances.data.length);

        console.log('-------test completed--------')

    } catch (e) {
        // Log the error for debugging
        console.error('An error occurred:', e);
    } finally {
        // Ensure the socket is closed
        if (zkInstance) {
            try {
                await zkInstance.disconnect();
                console.log('disconnected')
            } catch (error) {
                console.error('Error closing the socket:', error);
            }
        }
    }
}

test().catch(err => {
    // Handle any uncaught errors from the test function
    console.error('Unhandled error in test function:', err);
});
