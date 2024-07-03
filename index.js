/**
 *
 * Author: coding-libs
 * Date: 2024-07-01
 */

const ZTCP = require('./src/ztcp')
const ZUDP = require('./src/zudp')

const {ZkError, ERROR_TYPES} = require('./src/exceptions/handler')

class ZktecoJs {
    constructor(ip, port, timeout, inport) {
        this.connectionType = null

        this.ztcp = new ZTCP(ip, port, timeout)
        this.zudp = new ZUDP(ip, port, timeout, inport)
        this.interval = null
        this.timer = null
        this.isBusy = false
        this.ip = ip
    }

    async functionWrapper(tcpCallback, udpCallback, command) {
        switch (this.connectionType) {
            case 'tcp':
                if (this.ztcp.socket) {
                    try {
                        const res = await tcpCallback()
                        return res
                    } catch (err) {
                        return Promise.reject(new ZkError(
                            err,
                            `[TCP] ${command}`,
                            this.ip
                        ))
                    }

                } else {
                    return Promise.reject(new ZkError(
                        new Error(`Socket isn't connected !`),
                        `[TCP]`,
                        this.ip
                    ))
                }
            case 'udp':
                if (this.zudp.socket) {
                    try {
                        const res = await udpCallback()
                        return res
                    } catch (err) {
                        return Promise.reject(new ZkError(
                            err,
                            `[UDP] ${command}`,
                            this.ip
                        ))
                    }
                } else {
                    return Promise.reject(new ZkError(
                        new Error(`Socket isn't connected !`),
                        `[UDP]`,
                        this.ip
                    ))
                }
            default:
                return Promise.reject(new ZkError(
                    new Error(`Socket isn't connected !`),
                    '',
                    this.ip
                ))
        }
    }

    async createSocket(cbErr, cbClose) {
        try {
            if (!this.ztcp.socket) {
                try {
                    await this.ztcp.createSocket(cbErr, cbClose);
                } catch (err) {
                    throw err;
                }

                try {
                    await this.ztcp.connect();
                    console.log('ok tcp');
                    this.connectionType = 'tcp';
                    return true; // Return true if TCP connection is successful
                } catch (err) {
                    throw err;
                }
            }
        } catch (err) {
            try {
                await this.ztcp.disconnect();
            } catch (err) {
            }

            if (err.code !== ERROR_TYPES.ECONNREFUSED) {
                return Promise.reject(new ZkError(err, 'TCP CONNECT', this.ip));
            }

            try {
                if (!this.zudp.socket) {
                    await this.zudp.createSocket(cbErr, cbClose);
                    await this.zudp.connect();
                }

                console.log('ok udp');
                this.connectionType = 'udp';
                return true; // Return true if UDP connection is successful
            } catch (err) {
                if (err.code !== 'EADDRINUSE') {
                    this.connectionType = null;
                    try {
                        await this.zudp.disconnect();
                        this.zudp.socket = null;
                        this.ztcp.socket = null;
                    } catch (err) {
                    }

                    return Promise.reject(new ZkError(err, 'UDP CONNECT', this.ip));
                } else {
                    this.connectionType = 'udp';
                    return true; // Return true if UDP connection is successful after handling EADDRINUSE error
                }
            }
        }

        // Return false if no connection could be made
        return false;
    }

    async getUsers() {
        return await this.functionWrapper(
            () => this.ztcp.getUsers(),
            () => this.zudp.getUsers()
        )
    }

    async getTime() {
        return await this.functionWrapper(
            () => this.ztcp.getTime(),
            () => this.zudp.getTime()
        )
    }

    async setTime(t) {
        return await this.functionWrapper(
            () => this.ztcp.setTime(t),
            () => this.zudp.setTime(t)
        )
    }

    async getSerialNumber() {
        return await this.functionWrapper(
            () => this.ztcp.getSerialNumber()
        )
    }

    async getDeviceVersion() {
        return await this.functionWrapper(
            () => this.ztcp.getDeviceVersion()
        )
    }

    async getDeviceName() {
        return await this.functionWrapper(
            () => this.ztcp.getDeviceName()
        )
    }

    async getPlatform() {
        return await this.functionWrapper(
            () => this.ztcp.getPlatform()
        )
    }

    async getOS() {
        return await this.functionWrapper(
            () => this.ztcp.getOS()
        )
    }

    async getWorkCode() {
        return await this.functionWrapper(
            () => this.ztcp.getWorkCode()
        )
    }

    async getPIN() {
        return await this.functionWrapper(
            () => this.ztcp.getPIN()
        )
    }

    async getFaceOn() {
        return await this.functionWrapper(
            () => this.ztcp.getFaceOn()
        )
    }

    async getSSR() {
        return await this.functionWrapper(
            () => this.ztcp.getSSR()
        )
    }

    async getFirmware() {
        return await this.functionWrapper(
            () => this.ztcp.getFirmware()
        )
    }

    async setUser(uid, userid, name, password, role = 0, cardno = 0) {
        return await this.functionWrapper(
            () => this.ztcp.setUser(uid, userid, name, password, role, cardno)
        )
    }

    async getAttendanceSize() {
        return await this.functionWrapper(
            () => this.ztcp.getAttendanceSize()
        )
    }

    async getAttendances(cb) {
        return await this.functionWrapper(
            () => this.ztcp.getAttendances(cb),
            () => this.zudp.getAttendances(cb),
        )
    }

    async getRawAttendLog(cb) {
        return await this.functionWrapper(
            () => this.ztcp.getRawAttendLog(cb),
            () => this.zudp.getRawAttendLog(cb),
        )
    }

    async readAttendLogs(cb) {
        return await this.functionWrapper(
            () => this.ztcp.readAttendLogs(cb),
            () => this.zudp.readAttendLogs(cb),
        )
    }

    async getRealTimeLogs(cb) {
        return await this.functionWrapper(
            () => this.ztcp.getRealTimeLogs(cb),
            () => this.zudp.getRealTimeLogs(cb)
        )
    }

    async disconnect() {
        return await this.functionWrapper(
            () => this.ztcp.disconnect(),
            () => this.zudp.disconnect()
        )
    }

    async freeData() {
        return await this.functionWrapper(
            () => this.ztcp.freeData(),
            () => this.zudp.freeData()
        )
    }


    async disableDevice() {
        return await this.functionWrapper(
            () => this.ztcp.disableDevice(),
            () => this.zudp.disableDevice()
        )
    }


    async enableDevice() {
        return await this.functionWrapper(
            () => this.ztcp.enableDevice(),
            () => this.zudp.enableDevice()
        )
    }


    async getInfo() {
        return await this.functionWrapper(
            () => this.ztcp.getInfo(),
            () => this.zudp.getInfo()
        )
    }


    async getSocketStatus() {
        return await this.functionWrapper(
            () => this.ztcp.getSocketStatus(),
            () => this.zudp.getSocketStatus()
        )
    }

    async clearAttendanceLog() {
        return await this.functionWrapper(
            () => this.ztcp.clearAttendanceLog(),
            () => this.zudp.clearAttendanceLog()
        )
    }

    async executeCmd(command, data = '') {
        return await this.functionWrapper(
            () => this.ztcp.executeCmd(command, data),
            () => this.zudp.executeCmd(command, data)
        )
    }

    setIntervalSchedule(cb, timer) {
        this.interval = setInterval(cb, timer)
    }


    setTimerSchedule(cb, timer) {
        this.timer = setTimeout(cb, timer)
    }


}


module.exports = ZktecoJs




