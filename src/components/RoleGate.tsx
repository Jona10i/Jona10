import React from 'react';
import { useFirebase } from './FirebaseProvider';
import { Permission } from '../lib/rbac';
import { UserRole } from '../types';

interface RoleGateProps {
  children: React.ReactNode;
  permission?: Permission;
  minRole?: UserRole;
  fallback?: React.ReactNode;
}

export const RoleGate: React.FC<RoleGateProps> = ({ 
  children, 
  permission, 
  minRole, 
  fallback = null 
}) => {
  const { hasPerm, isAtLeast } = useFirebase();

  let hasAccess = true;

  if (permission && !hasPerm(permission)) {
    hasAccess = false;
  }

  if (minRole && !isAtLeast(minRole)) {
    hasAccess = false;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
