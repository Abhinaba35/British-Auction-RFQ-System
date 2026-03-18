import React, { createContext, useContext, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);

  useEffect(() => {
    const socketUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5002';
    socketRef.current = io(socketUrl, {
      transports: ['websocket'],
      autoConnect: true,
    });
    return () => socketRef.current?.disconnect();
  }, []);

  const joinAuction = (rfqId) => socketRef.current?.emit('join_auction', rfqId);
  const leaveAuction = (rfqId) => socketRef.current?.emit('leave_auction', rfqId);
  const on = (event, cb) => socketRef.current?.on(event, cb);
  const off = (event, cb) => socketRef.current?.off(event, cb);

  return (
    <SocketContext.Provider value={{ joinAuction, leaveAuction, on, off }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
