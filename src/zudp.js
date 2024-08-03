/**
 *
 * Author: coding-libs
 * Date: 2024-07-01
 */
const dgram = require('dgram')
const {
    createUDPHeader,
    decodeUserData28,
    decodeRecordData16,
    decodeRecordRealTimeLog18,
    decodeUDPHeader,
    exportErrorMessage,
    checkNotEventUDP
} = require('./helper/utils')

const {MAX_CHUNK, REQUEST_DATA, COMMANDS} = require('./helper/command')

const { log } = require('./logs/log')
const timeParser = require("./helper/time");

class ZUDP {
    constructor(ip, port, timeout, inport) {
        this.ip = ip
        this.port = port
        this.timeout = timeout
        this.socket = null
        this.sessionId = null
        this.replyId = 0
        this.inport = inport
    }


    createSocket(cbError = null, cbClose = null) {
        return new Promise((resolve, reject) => {
            this.socket = dgram.createSocket('udp4');
            this.socket.setMaxListeners(Infinity); // Allow unlimited listeners

            // Handle socket errors
            this.socket.once('error', err => {
                this.socket = null; // Clean up the socket reference
                reject(err); // Reject the promise
                if (cbError) cbError(err); // Call the error callback if provided
            });

            // Handle socket close event
            this.socket.once('close', () => {
                this.socket = null; // Clean up the socket reference
                if (cbClose) cbClose('udp'); // Call the close callback if provided
            });

            // Handle socket listening event
            this.socket.once('listening', () => {
                resolve(this.socket); // Resolve the promise with the socket
            });

            // Bind the socket to the specified port
            try {
                this.socket.bind(this.inport);
            } catch (err) {
                this.socket = null; // Clean up the socket reference
                reject(err); // Reject the promise
                if (cbError) cbError(err); // Call the error callback if provided
            }
        });
    }


    async connect() {
        try {
            const reply = await this.executeCmd(COMMANDS.CMD_CONNECT, '');

            if (reply) {
                return true; // Resolve with true if the reply is valid
            } else {
                throw new Error('NO_REPLY_ON_CMD_CONNECT'); // Throw an error if no reply
            }
        } catch (err) {
            // Log the error for debugging purposes
            console.error('Error in connect method:', err);
            throw err; // Re-throw the error to be handled by the caller
        }
    }


    closeSocket() {
        return new Promise((resolve, reject) => {
            // Ensure the socket exists and is properly handled
            if (!this.socket) {
                resolve(true);
                return;
            }

            // Remove all listeners for the 'message' event
            this.socket.removeAllListeners('message');

            // Create a timeout to handle cases where the socket might not close in a timely manner
            const timeout = 2000; // Timeout duration in milliseconds
            const timer = setTimeout(() => {
                console.warn('Socket close timeout');
                resolve(true);
            }, timeout);

            // Handle the socket close operation
            this.socket.close((err) => {
                // Clear the timer as socket is closing
                clearTimeout(timer);

                // Handle any potential errors during the closing process
                if (err) {
                    console.error('Error closing socket:', err);
                    reject(err);
                } else {
                    resolve(true);
                }

                // Set the socket to null after closing
                this.socket = null;
            });
        });
    }


    writeMessage(msg, connect) {
        return new Promise((resolve, reject) => {
            let sendTimeoutId;

            // Setup a listener for the response message
            const onMessage = (data) => {
                clearTimeout(sendTimeoutId); // Clear timeout if message is received
                this.socket.removeListener('message', onMessage); // Remove the listener
                resolve(data); // Resolve the promise with the received data
            };

            this.socket.once('message', onMessage); // Use once to ensure single response

            // Send the message
            this.socket.send(msg, 0, msg.length, this.port, this.ip, (err) => {
                if (err) {
                    this.socket.removeListener('message', onMessage); // Clean up listener on error
                    reject(err); // Reject the promise with the error
                    return; // Exit early to avoid setting timeout on error
                }

                // Setup a timeout if a timeout duration is specified
                if (this.timeout) {
                    sendTimeoutId = setTimeout(() => {
                        this.socket.removeListener('message', onMessage); // Clean up listener on timeout
                        reject(new Error('TIMEOUT_ON_WRITING_MESSAGE')); // Reject the promise on timeout
                    }, connect ? 2000 : this.timeout);
                }
            });
        });
    }

    requestData(msg) {
        return new Promise((resolve, reject) => {
            let sendTimeoutId;
            let responseTimeoutId;

            // Define the callback to handle incoming data
            const handleOnData = (data) => {
                if (checkNotEventUDP(data)) return; // Filter out unwanted data

                // Clear any existing timeouts
                clearTimeout(sendTimeoutId);
                clearTimeout(responseTimeoutId);

                // Remove the event listener for 'message'
                this.socket.removeListener('message', handleOnData);

                // Resolve the promise with the received data
                resolve(data);
            };

            // Define the timeout callback for handling the receive timeout
            const onReceiveTimeout = () => {
                this.socket.removeListener('message', handleOnData);
                reject(new Error('TIMEOUT_ON_RECEIVING_REQUEST_DATA'));
            };

            // Attach the data event listener
            this.socket.on('message', handleOnData);

            // Send the message
            this.socket.send(msg, 0, msg.length, this.port, this.ip, (err) => {
                if (err) {
                    this.socket.removeListener('message', handleOnData); // Clean up listener on error
                    reject(err);
                    return;
                }

                // Set up the timeout for receiving a response
                responseTimeoutId = setTimeout(onReceiveTimeout, this.timeout);
            });

            // Set up the timeout for sending the message
            sendTimeoutId = setTimeout(() => {
                this.socket.removeListener('message', handleOnData);
                reject(new Error('TIMEOUT_IN_RECEIVING_RESPONSE_AFTER_REQUESTING_DATA'));
            }, this.timeout);
        });
    }


    /**
     *
     * @param {*} command
     * @param {*} data
     *
     *
     * reject error when command fail and resolve data when success
     */
    async executeCmd(command, data) {
        try {
            // Handle command-specific logic
            if (command === COMMANDS.CMD_CONNECT) {
                this.sessionId = 0;
                this.replyId = 0;
            } else {
                this.replyId++;
            }

            // Create and send the UDP packet
            const buf = createUDPHeader(command, this.sessionId, this.replyId, data);
            const reply = await this.writeMessage(buf, command === COMMANDS.CMD_CONNECT || command === COMMANDS.CMD_EXIT);

            // Process the reply if necessary
            if (reply && reply.length > 0) { // Check if reply is not empty
                if (command === COMMANDS.CMD_CONNECT) {
                    this.sessionId = reply.readUInt16LE(4);
                }
            }

            // Return the reply
            return reply;

        } catch (err) {
            // Handle errors by logging or throwing them
            console.error(`Error executing command ${command}:`, err);
            throw err;
        }
    }


    async sendChunkRequest(start, size) {
        this.replyId++;
        const reqData = Buffer.alloc(8);
        reqData.writeUInt32LE(start, 0);
        reqData.writeUInt32LE(size, 4);
        const buf = createUDPHeader(COMMANDS.CMD_DATA_RDY, this.sessionId, this.replyId, reqData);

        try {
            await new Promise((resolve, reject) => {
                // Send the buffer over UDP
                this.socket.send(buf, 0, buf.length, this.port, this.ip, (err) => {
                    if (err) {
                        // Log the error and reject the promise
                        log(`[UDP][SEND_CHUNK_REQUEST] Error sending chunk request: ${err.message}`);
                        reject(err);
                    } else {
                        // Resolve the promise if sending was successful
                        resolve();
                    }
                });
            });
        } catch (error) {
            // Log any exceptions that occur during the send operation
            log(`[UDP][SEND_CHUNK_REQUEST] Exception: ${error.message}`);
            throw error; // Re-throw the error if it needs to be handled further up
        }
    }


    /**
     *
     * @param {*} reqData - indicate the type of data that need to receive ( user or attLog)
     * @param {*} cb - callback is triggered when receiving packets
     *
     * readWithBuffer will reject error if it'wrong when starting request data
     * readWithBuffer will return { data: replyData , err: Error } when receiving requested data
     */
    async readWithBuffer(reqData, cb = null) {
        this.replyId++;
        const buf = createUDPHeader(COMMANDS.CMD_DATA_WRRQ, this.sessionId, this.replyId, reqData);

        try {
            const reply = await this.requestData(buf);
            const header = decodeUDPHeader(reply.subarray(0, 8));

            switch (header.commandId) {
                case COMMANDS.CMD_DATA:
                    return { data: reply.subarray(8), mode: 8, err: null };

                case COMMANDS.CMD_ACK_OK:
                case COMMANDS.CMD_PREPARE_DATA:
                    return await this.handleChunkedData(reply, header.commandId, cb);

                default:
                    throw new Error('ERROR_IN_UNHANDLE_CMD ' + exportErrorMessage(header.commandId));
            }
        } catch (err) {
            return { err, data: null };
        }
    }

    async handleChunkedData(reply, commandId, cb) {
        const recvData = reply.subarray(8);
        const size = recvData.readUIntLE(1, 4);
        let totalBuffer = Buffer.from([]);
        const timeout = 3000;

        let timer = setTimeout(() => {
            this.socket.removeListener('message', handleOnData);
            throw new Error('TIMEOUT WHEN RECEIVING PACKET');
        }, timeout);

        const internalCallback = (replyData, err = null) => {
            this.socket.removeListener('message', handleOnData);
            clearTimeout(timer);
            if (err) {
                return { err, data: replyData };
            }
            return { err: null, data: replyData };
        };

        const handleOnData = (reply) => {
            if (checkNotEventUDP(reply)) return;

            clearTimeout(timer);
            timer = setTimeout(() => {
                internalCallback(totalBuffer, new Error(`TIMEOUT !! ${(size - totalBuffer.length) / size} % REMAIN !`));
            }, timeout);

            const header = decodeUDPHeader(reply);
            switch (header.commandId) {
                case COMMANDS.CMD_PREPARE_DATA:
                    break;

                case COMMANDS.CMD_DATA:
                    totalBuffer = Buffer.concat([totalBuffer, reply.subarray(8)]);
                    cb && cb(totalBuffer.length, size);
                    break;

                case COMMANDS.CMD_ACK_OK:
                    if (totalBuffer.length === size) {
                        internalCallback(totalBuffer);
                    }
                    break;

                default:
                    internalCallback([], new Error('ERROR_IN_UNHANDLE_CMD ' + exportErrorMessage(header.commandId)));
            }
        };

        this.socket.on('message', handleOnData);

        const chunkCount = Math.ceil(size / MAX_CHUNK);
        for (let i = 0; i < chunkCount; i++) {
            const start = i * MAX_CHUNK;
            const chunkSize = (i === chunkCount - 1) ? size % MAX_CHUNK : MAX_CHUNK;
            this.sendChunkRequest(start, chunkSize);
        }
    }


    async getUsers() {
        try {
            // Free Buffer Data to request Data
            if (this.socket) {
                await this.freeData();
            }

            // Read user data from the buffer
            const data = await this.readWithBuffer(REQUEST_DATA.GET_USERS);

            // Free Buffer Data after requesting data
            if (this.socket) {
                await this.freeData();
            }

            const USER_PACKET_SIZE = 28;
            let userData = data.data.subarray(4);
            const users = [];

            // Decode user data
            while (userData.length >= USER_PACKET_SIZE) {
                const user = decodeUserData28(userData.subarray(0, USER_PACKET_SIZE));
                users.push(user);
                userData = userData.subarray(USER_PACKET_SIZE);
            }

            return { data: users, err: data.err };
        } catch (err) {
            // Handle any errors that occurred
            return { data: [], err };
        }
    }



    /**
     *
     * @param {*} ip
     * @param {*} callbackInProcess
     *  reject error when starting request data
     *  return { data: records, err: Error } when receiving requested data
     */
    async getAttendances(callbackInProcess = () => {}) {
        try {
            // Free Buffer Data before requesting new data
            if (this.socket) {
                await this.freeData();
            }

            // Read attendance data
            const data = await this.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS, callbackInProcess);

            // Free Buffer Data after requesting data
            if (this.socket) {
                await this.freeData();
            }

            const RECORD_PACKET_SIZE = data.mode ? 8 : 16;
            let recordData = data.data.subarray(4);

            // Process and decode record data
            const records = [];
            while (recordData.length >= RECORD_PACKET_SIZE) {
                const record = decodeRecordData16(recordData.subarray(0, RECORD_PACKET_SIZE));
                records.push({ ...record, ip: this.ip });
                recordData = recordData.subarray(RECORD_PACKET_SIZE);
            }

            return { data: records, err: data.err };
        } catch (err) {
            // Handle errors that occurred during the process
            return { data: [], err };
        }
    }

    async freeData() {
        try {
            // Send command to free data with an empty buffer
            return await this.executeCmd(COMMANDS.CMD_FREE_DATA, Buffer.alloc(0));
        } catch (err) {
            // Handle errors and rethrow or log if necessary
            console.error('Error freeing data:', err);
            throw err; // Re-throw the error to propagate it
        }
    }

    async getInfo() {
        try {
            // Execute command to get free sizes
            const data = await this.executeCmd(COMMANDS.CMD_GET_FREE_SIZES, Buffer.alloc(0));

            // Parse the data
            return {
                userCounts: data.readUIntLE(24, 4),
                logCounts: data.readUIntLE(40, 4),
                logCapacity: data.readUIntLE(72, 4)
            };
        } catch (err) {
            // Handle and propagate any errors that occur
            console.error('Error retrieving info:', err);
            throw err; // Re-throw the error to allow it to be handled by the caller
        }
    }


    async getTime() {
        try {
            // Execute command to get time
            const response = await this.executeCmd(COMMANDS.CMD_GET_TIME, Buffer.alloc(0));

            // Parse and return the time
            const timeValue = response.readUInt32LE(8);
            return timeParser.decode(timeValue);
        } catch (err) {
            // Log and propagate the error
            console.error('Error retrieving time:', err);
            throw err; // Re-throw the error to be handled by the caller
        }
    }


    async setTime(tm) {
        try {
            // Create a buffer for the command
            const commandBuffer = Buffer.alloc(32);

            // Encode the time and write it to the buffer
            commandBuffer.writeUInt32LE(timeParser.encode(new Date(tm)), 0);

            // Send the command to set the time
            await this.executeCmd(COMMANDS.CMD_SET_TIME, commandBuffer);

            // Indicate success
            return true;
        } catch (err) {
            // Log and propagate the error
            console.error('Error setting time:', err);
            throw err; // Re-throw the error to allow it to be handled by the caller
        }
    }


    async clearAttendanceLog() {
        try {
            // Execute command to clear attendance log
            return await this.executeCmd(COMMANDS.CMD_CLEAR_ATTLOG, Buffer.alloc(0));
        } catch (err) {
            // Log and propagate the error
            console.error('Error clearing attendance log:', err);
            throw err; // Re-throw the error to allow it to be handled by the caller
        }
    }

    async clearData() {
        try {
            // Execute command to clear data
            return await this.executeCmd(COMMANDS.CMD_CLEAR_DATA, Buffer.alloc(0));
        } catch (err) {
            // Log and propagate the error
            console.error('Error clearing data:', err);
            throw err; // Re-throw the error to allow it to be handled by the caller
        }
    }

    async disableDevice() {
        try {
            // Execute command to disable the device with required data
            return await this.executeCmd(COMMANDS.CMD_DISABLEDEVICE, REQUEST_DATA.DISABLE_DEVICE);
        } catch (err) {
            // Log and propagate the error
            console.error('Error disabling device:', err);
            throw err; // Re-throw the error to allow it to be handled by the caller
        }
    }

    async enableDevice() {
        try {
            // Execute command to enable the device
            return await this.executeCmd(COMMANDS.CMD_ENABLEDEVICE, Buffer.alloc(0));
        } catch (err) {
            // Log and propagate the error
            console.error('Error enabling device:', err);
            throw err; // Re-throw the error to allow it to be handled by the caller
        }
    }


    async disconnect() {
        try {
            // Attempt to send the disconnect command
            await this.executeCmd(COMMANDS.CMD_EXIT, Buffer.alloc(0));
        } catch (err) {
            // Log the error if the command fails
            console.error('Error executing disconnect command:', err);
            // Optionally, you can handle the error or clean up here
        }

        // Ensure the socket is closed
        try {
            await this.closeSocket();
        } catch (err) {
            // Log the error if closing the socket fails
            console.error('Error closing the socket:', err);
            // Optionally, you can handle the error or clean up here
        }
    }


    async getRealTimeLogs(cb = () => {}) {
        // Increment replyId
        this.replyId++;

        // Create the UDP header with the command and data
        const buf = createUDPHeader(COMMANDS.CMD_REG_EVENT, this.sessionId, this.replyId, REQUEST_DATA.GET_REAL_TIME_EVENT);

        // Send the command via the socket
        try {
            this.socket.send(buf, 0, buf.length, this.port, this.ip, (err) => {
                if (err) {
                    console.error('Error sending UDP message:', err);
                    return;
                }
                console.log('UDP message sent successfully');
            });
        } catch (err) {
            console.error('Error during send operation:', err);
            return; // Early return if sending fails
        }

        // Add a single listener for the 'message' event
        const handleMessage = (data) => {
            if (!checkNotEventUDP(data)) return;

            if (data.length === 18) {
                cb(decodeRecordRealTimeLog18(data));
            }
        };

        if (this.socket.listenerCount('message') === 0) {
            this.socket.on('message', handleMessage);
        } else {
            // Optionally handle the case where multiple listeners are not allowed
            console.warn('Multiple message listeners detected. Ensure only one listener is attached.');
        }
    }

}


module.exports = ZUDP