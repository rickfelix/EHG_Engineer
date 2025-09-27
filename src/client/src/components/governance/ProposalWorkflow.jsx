import React, { useState, useEffect } from 'react';
import { FileText, Send, Clock, CheckCircle, XCircle, AlertCircle, ArrowRight, Users, MessageSquare } from 'lucide-react';

const ProposalWorkflow = () => {
  const [proposals, setProposals] = useState([
    {
      id: 'PROP-001',
      title: 'Implement Real-time Collaboration Features',
      description: 'Add WebSocket-based real-time collaboration capabilities to allow multiple users to work on the same SD simultaneously',
      author: 'Development Team',
      status: 'in_review',
      priority: 'high',
      created: '2025-01-25T10:00:00Z',
      votes: { for: 8, against: 2 },
      comments: 5,
      assignedTo: 'Architecture Board',
      estimatedEffort: '3 sprints',
      businessImpact: 'HIGH',
      technicalComplexity: 'MEDIUM'
    },
    {
      id: 'PROP-002',
      title: 'AI-Powered PRD Generation Enhancement',
      description: 'Enhance the PRD generation system with advanced AI capabilities for better user story creation and acceptance criteria',
      author: 'Product Team',
      status: 'approved',
      priority: 'medium',
      created: '2025-01-24T14:30:00Z',
      votes: { for: 12, against: 1 },
      comments: 8,
      assignedTo: 'LEAD Agent',
      estimatedEffort: '2 sprints',
      businessImpact: 'MEDIUM',
      technicalComplexity: 'HIGH'
    },
    {
      id: 'PROP-003',
      title: 'Mobile Application Support',
      description: 'Create responsive mobile views for the governance dashboard to enable on-the-go SD management',
      author: 'UX Team',
      status: 'draft',
      priority: 'low',
      created: '2025-01-26T09:15:00Z',
      votes: { for: 3, against: 0 },
      comments: 2,
      assignedTo: null,
      estimatedEffort: '4 sprints',
      businessImpact: 'LOW',
      technicalComplexity: 'LOW'
    },
    {
      id: 'PROP-004',
      title: 'Automated Compliance Reporting',
      description: 'Build automated compliance reporting system that generates regulatory reports from SD completion data',
      author: 'Compliance Team',
      status: 'rejected',
      priority: 'high',
      created: '2025-01-23T11:00:00Z',
      votes: { for: 4, against: 7 },
      comments: 12,
      rejectionReason: 'Out of scope for current phase',
      estimatedEffort: '5 sprints',
      businessImpact: 'HIGH',
      technicalComplexity: 'HIGH'
    }
  ]);

  const [selectedProposal, setSelectedProposal] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [filter, setFilter] = useState('all');

  const workflowStages = [
    { id: 'draft', name: 'Draft', icon: FileText, color: 'gray' },
    { id: 'in_review', name: 'In Review', icon: Clock, color: 'blue' },
    { id: 'approved', name: 'Approved', icon: CheckCircle, color: 'green' },
    { id: 'rejected', name: 'Rejected', icon: XCircle, color: 'red' }
  ];

  const getStatusIcon = (status) => {
    const stage = workflowStages.find(s => s.id === status);
    if (!stage) return null;
    const Icon = stage.icon;
    return <Icon className={`h-5 w-5 text-${stage.color}-500`} />;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'in_review':
        return 'bg-blue-100 text-blue-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleStatusChange = (proposalId, newStatus) => {
    setProposals(proposals.map(p =>
      p.id === proposalId ? { ...p, status: newStatus } : p
    ));
  };

  const handleVote = (proposalId, voteType) => {
    setProposals(proposals.map(p =>
      p.id === proposalId
        ? {
            ...p,
            votes: {
              ...p.votes,
              [voteType]: p.votes[voteType] + 1
            }
          }
        : p
    ));
  };

  const filteredProposals = filter === 'all'
    ? proposals
    : proposals.filter(p => p.status === filter);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center">
          <FileText className="h-6 w-6 mr-2 text-indigo-600" />
          Governance Proposal Workflow
        </h2>
        <p className="text-gray-600">Review and approve strategic initiatives through structured governance</p>
        <div className="mt-2">
          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            SD-GOVERNANCE-UI-001
          </span>
        </div>
      </div>

      {/* Workflow Pipeline */}
      <div className="mb-6">
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg">
          {workflowStages.map((stage, index) => (
            <React.Fragment key={stage.id}>
              <div className="flex flex-col items-center">
                <div className={`p-3 rounded-full bg-${stage.color}-100 mb-2`}>
                  <stage.icon className={`h-6 w-6 text-${stage.color}-600`} />
                </div>
                <span className="text-sm font-medium">{stage.name}</span>
                <span className="text-xs text-gray-500 mt-1">
                  {proposals.filter(p => p.status === stage.id).length} items
                </span>
              </div>
              {index < workflowStages.length - 1 && (
                <ArrowRight className="h-5 w-5 text-gray-400" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded ${
            filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
          }`}
        >
          All ({proposals.length})
        </button>
        {workflowStages.map(stage => (
          <button
            key={stage.id}
            onClick={() => setFilter(stage.id)}
            className={`px-3 py-1 rounded ${
              filter === stage.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {stage.name} ({proposals.filter(p => p.status === stage.id).length})
          </button>
        ))}
      </div>

      {/* Proposals List */}
      <div className="space-y-4">
        {filteredProposals.map(proposal => (
          <div
            key={proposal.id}
            className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
            onClick={() => setSelectedProposal(proposal)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center mb-2">
                  {getStatusIcon(proposal.status)}
                  <h3 className="ml-2 font-semibold">{proposal.title}</h3>
                  <span className={`ml-3 px-2 py-1 rounded text-xs ${getPriorityColor(proposal.priority)}`}>
                    {proposal.priority}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3">{proposal.description}</p>

                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center">
                    <Users className="h-3 w-3 mr-1" />
                    {proposal.author}
                  </span>
                  <span className="flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {new Date(proposal.created).toLocaleDateString()}
                  </span>
                  {proposal.assignedTo && (
                    <span className="flex items-center">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {proposal.assignedTo}
                    </span>
                  )}
                  <span className="flex items-center">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    {proposal.comments} comments
                  </span>
                </div>

                {/* Metrics */}
                <div className="mt-3 flex gap-3">
                  <span className="text-xs px-2 py-1 bg-blue-50 rounded">
                    Impact: {proposal.businessImpact}
                  </span>
                  <span className="text-xs px-2 py-1 bg-purple-50 rounded">
                    Complexity: {proposal.technicalComplexity}
                  </span>
                  <span className="text-xs px-2 py-1 bg-orange-50 rounded">
                    Effort: {proposal.estimatedEffort}
                  </span>
                </div>
              </div>

              {/* Voting */}
              <div className="ml-4 text-center">
                <div className="flex flex-col gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVote(proposal.id, 'for');
                    }}
                    className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                  >
                    👍 {proposal.votes.for}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVote(proposal.id, 'against');
                    }}
                    className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    👎 {proposal.votes.against}
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {Math.round((proposal.votes.for / (proposal.votes.for + proposal.votes.against)) * 100)}% approval
                </div>
              </div>
            </div>

            {/* Rejection Reason */}
            {proposal.status === 'rejected' && proposal.rejectionReason && (
              <div className="mt-3 p-2 bg-red-50 rounded">
                <span className="text-sm text-red-700">
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  Rejection reason: {proposal.rejectionReason}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            {proposal.status === 'in_review' && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusChange(proposal.id, 'approved');
                  }}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusChange(proposal.id, 'rejected');
                  }}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            )}

            {proposal.status === 'draft' && (
              <div className="mt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusChange(proposal.id, 'in_review');
                  }}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center"
                >
                  <Send className="h-3 w-3 mr-1" />
                  Submit for Review
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create New Proposal Button */}
      <div className="mt-6 text-center">
        <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
          Create New Proposal
        </button>
      </div>
    </div>
  );
};

export default ProposalWorkflow;