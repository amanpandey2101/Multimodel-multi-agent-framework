import React from 'react';

const UserNotification = ({ message, type }) => {
    return (
        <div className={`notification ${type}`}>{message}</div>
    );
};

export default UserNotification;
