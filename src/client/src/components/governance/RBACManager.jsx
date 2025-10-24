import React, { useState } from 'react';
import { Shield, Users, Key, Lock, Unlock, UserCheck, Settings, Edit, Trash2, Plus } from 'lucide-react';

const RBACManager = () => {
  const [roles, setRoles] = useState([
    {
      id: 'role-001',
      name: 'Strategic Lead',
      description: 'Full control over strategic directives and approval workflows',
      permissions: ['sd.create', 'sd.edit', 'sd.delete', 'sd.approve', 'prd.create', 'prd.edit', 'prd.approve', 'handoff.create', 'handoff.approve'],
      users: ['Alice Johnson', 'Bob Smith'],
      color: 'purple'
    },
    {
      id: 'role-002',
      name: 'Technical Architect',
      description: 'Design and planning permissions with PRD creation',
      permissions: ['sd.view', 'sd.edit', 'prd.create', 'prd.edit', 'handoff.create', 'testing.execute'],
      users: ['Charlie Davis', 'Diana Prince', 'Eve Wilson'],
      color: 'blue'
    },
    {
      id: 'role-003',
      name: 'Developer',
      description: 'Implementation and testing permissions',
      permissions: ['sd.view', 'prd.view', 'handoff.view', 'implementation.execute', 'testing.execute'],
      users: ['Frank Miller', 'Grace Lee', 'Henry Chen', 'Iris Zhang'],
      color: 'green'
    },
    {
      id: 'role-004',
      name: 'QA Engineer',
      description: 'Testing and verification permissions',
      permissions: ['sd.view', 'prd.view', 'testing.create', 'testing.execute', 'verification.approve'],
      users: ['Jack Brown', 'Kelly White'],
      color: 'yellow'
    },
    {
      id: 'role-005',
      name: 'Observer',
      description: 'Read-only access to all governance data',
      permissions: ['sd.view', 'prd.view', 'handoff.view', 'reports.view'],
      users: ['Leo Martinez', 'Maria Garcia', 'Nathan Taylor'],
      color: 'gray'
    }
  ]);

  const [permissions] = useState([
    { category: 'Strategic Directives', items: [
      { id: 'sd.create', name: 'Create SD', risk: 'high' },
      { id: 'sd.edit', name: 'Edit SD', risk: 'medium' },
      { id: 'sd.delete', name: 'Delete SD', risk: 'high' },
      { id: 'sd.approve', name: 'Approve SD', risk: 'high' },
      { id: 'sd.view', name: 'View SD', risk: 'low' }
    ]},
    { category: 'Product Requirements', items: [
      { id: 'prd.create', name: 'Create PRD', risk: 'medium' },
      { id: 'prd.edit', name: 'Edit PRD', risk: 'medium' },
      { id: 'prd.approve', name: 'Approve PRD', risk: 'high' },
      { id: 'prd.view', name: 'View PRD', risk: 'low' }
    ]},
    { category: 'Handoffs', items: [
      { id: 'handoff.create', name: 'Create Handoff', risk: 'medium' },
      { id: 'handoff.approve', name: 'Approve Handoff', risk: 'medium' },
      { id: 'handoff.view', name: 'View Handoff', risk: 'low' }
    ]},
    { category: 'Execution', items: [
      { id: 'implementation.execute', name: 'Execute Implementation', risk: 'high' },
      { id: 'testing.create', name: 'Create Tests', risk: 'low' },
      { id: 'testing.execute', name: 'Execute Tests', risk: 'medium' },
      { id: 'verification.approve', name: 'Approve Verification', risk: 'high' }
    ]},
    { category: 'Reporting', items: [
      { id: 'reports.view', name: 'View Reports', risk: 'low' },
      { id: 'reports.export', name: 'Export Reports', risk: 'medium' }
    ]}
  ]);

  const [selectedRole, setSelectedRole] = useState(roles[0]);
  const [showPermissionMatrix, setShowPermissionMatrix] = useState(false);
  const [editingRole, setEditingRole] = useState(null);

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'high':
        return 'text-red-600 bg-red-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'low':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getRoleColor = (color) => {
    const colors = {
      purple: 'bg-purple-100 text-purple-800 border-purple-300',
      blue: 'bg-blue-100 text-blue-800 border-blue-300',
      green: 'bg-green-100 text-green-800 border-green-300',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      gray: 'bg-gray-100 text-gray-800 border-gray-300'
    };
    return colors[color] || colors.gray;
  };

  const handlePermissionToggle = (roleId, permissionId) => {
    setRoles(roles.map(role => {
      if (role.id === roleId) {
        const hasPermission = role.permissions.includes(permissionId);
        return {
          ...role,
          permissions: hasPermission
            ? role.permissions.filter(p => p !== permissionId)
            : [...role.permissions, permissionId]
        };
      }
      return role;
    }));
  };

  const handleAddUser = (roleId, userName) => {
    setRoles(roles.map(role => {
      if (role.id === roleId) {
        return {
          ...role,
          users: [...role.users, userName]
        };
      }
      return role;
    }));
  };

  const handleRemoveUser = (roleId, userName) => {
    setRoles(roles.map(role => {
      if (role.id === roleId) {
        return {
          ...role,
          users: role.users.filter(u => u !== userName)
        };
      }
      return role;
    }));
  };

  const handleKeyDown = (event, callback) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center">
          <Shield className="h-6 w-6 mr-2 text-purple-600" />
          Role-Based Access Control (RBAC)
        </h2>
        <p className="text-gray-600">Manage user roles and permissions for governance operations</p>
        <div className="mt-2">
          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            SD-GOVERNANCE-UI-001
          </span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="text-center p-4 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{roles.length}</div>
          <div className="text-xs text-gray-600">Total Roles</div>
        </div>
        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">
            {roles.reduce((acc, role) => acc + role.users.length, 0)}
          </div>
          <div className="text-xs text-gray-600">Total Users</div>
        </div>
        <div className="text-center p-4 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">
            {permissions.reduce((acc, cat) => acc + cat.items.length, 0)}
          </div>
          <div className="text-xs text-gray-600">Permissions</div>
        </div>
        <div className="text-center p-4 bg-yellow-50 rounded-lg">
          <div className="text-2xl font-bold text-yellow-600">
            {permissions.reduce((acc, cat) => acc + cat.items.filter(i => i.risk === 'high').length, 0)}
          </div>
          <div className="text-xs text-gray-600">High Risk</div>
        </div>
        <div className="text-center p-4 bg-red-50 rounded-lg">
          <div className="text-2xl font-bold text-red-600">3</div>
          <div className="text-xs text-gray-600">Audit Alerts</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Roles List */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center justify-between">
            Roles
            <button className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 flex items-center">
              <Plus className="h-3 w-3 mr-1" />
              Add Role
            </button>
          </h3>
          <div className="space-y-3">
            {roles.map(role => (
              <div
                key={role.id}
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  selectedRole?.id === role.id
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedRole(role)}
                onKeyDown={(e) => handleKeyDown(e, () => setSelectedRole(role))}
                tabIndex="0"
                role="button"
                aria-label={`Select role: ${role.name}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className={`font-semibold inline-block px-2 py-1 rounded ${getRoleColor(role.color)}`}>
                      {role.name}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">{role.description}</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingRole(role);
                      }}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      <Edit className="h-4 w-4 text-gray-500" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Handle delete
                      }}
                      className="p-1 hover:bg-red-100 rounded"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center text-gray-500">
                    <Users className="h-3 w-3 mr-1" />
                    {role.users.length} users
                  </span>
                  <span className="flex items-center text-gray-500">
                    <Key className="h-3 w-3 mr-1" />
                    {role.permissions.length} permissions
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Role Details */}
        <div>
          {selectedRole ? (
            <>
              <h3 className="text-lg font-semibold mb-3">Role Details: {selectedRole.name}</h3>

              {/* Users */}
              <div className="mb-6">
                <h4 className="font-medium mb-2 flex items-center">
                  <UserCheck className="h-4 w-4 mr-1" />
                  Assigned Users ({selectedRole.users.length})
                </h4>
                <div className="space-y-2">
                  {selectedRole.users.map(user => (
                    <div key={user} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm">{user}</span>
                      <button
                        onClick={() => handleRemoveUser(selectedRole.id, user)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button className="w-full p-2 border-2 border-dashed border-gray-300 rounded text-sm text-gray-500 hover:border-gray-400">
                    + Add User
                  </button>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <h4 className="font-medium mb-2 flex items-center justify-between">
                  <span className="flex items-center">
                    <Lock className="h-4 w-4 mr-1" />
                    Permissions
                  </span>
                  <button
                    onClick={() => setShowPermissionMatrix(!showPermissionMatrix)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {showPermissionMatrix ? 'Hide Matrix' : 'Show Matrix'}
                  </button>
                </h4>

                {showPermissionMatrix ? (
                  <div className="border rounded-lg p-3 max-h-96 overflow-y-auto">
                    {permissions.map(category => (
                      <div key={category.category} className="mb-4">
                        <h5 className="font-medium text-sm mb-2">{category.category}</h5>
                        <div className="space-y-1">
                          {category.items.map(permission => (
                            <label
                              key={permission.id}
                              className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedRole.permissions.includes(permission.id)}
                                onChange={() => handlePermissionToggle(selectedRole.id, permission.id)}
                                className="mr-3"
                              />
                              <span className="flex-1 text-sm">{permission.name}</span>
                              <span className={`text-xs px-2 py-1 rounded ${getRiskColor(permission.risk)}`}>
                                {permission.risk} risk
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedRole.permissions.map(permId => {
                      const perm = permissions.flatMap(c => c.items).find(p => p.id === permId);
                      return perm ? (
                        <span
                          key={permId}
                          className={`px-2 py-1 rounded text-xs ${getRiskColor(perm.risk)}`}
                        >
                          {perm.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Shield className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>Select a role to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Audit Log */}
      <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
        <h3 className="font-semibold mb-2 flex items-center">
          <AlertCircle className="h-4 w-4 mr-2 text-yellow-600" />
          Recent Permission Changes
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Alice Johnson granted 'sd.approve' to Technical Architect role</span>
            <span className="text-xs text-gray-500">2 hours ago</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Bob Smith removed from Strategic Lead role</span>
            <span className="text-xs text-gray-500">1 day ago</span>
          </div>
          <div className="flex items-center justify-between">
            <span>New role 'Compliance Officer' created with 5 permissions</span>
            <span className="text-xs text-gray-500">3 days ago</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RBACManager;