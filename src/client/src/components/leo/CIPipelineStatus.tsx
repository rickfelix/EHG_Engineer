import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  GitBranch,
  ExternalLink,
  RefreshCw,
  Activity,
  Zap,
  Shield,
  Database
} from 'lucide-react';
import { useSupabase } from '@/integrations/supabase/client';

interface PipelineStatus {
  id: string;
  sd_id: string;
  repository_name: string;
  workflow_name: string;
  status: string;
  conclusion: string | null;
  commit_sha: string;
  commit_message: string;
  branch_name: string;
  started_at: string;
  completed_at: string | null;
  workflow_url: string;
  failure_reason?: string;
}

interface CiCdGate {
  id: string;
  sd_id: string;
  phase_name: string;
  gate_type: string;
  validation_status: string;
  validation_score: number;
  last_validation_at: string;
  validation_details: any;
}

interface FailureResolution {
  id: string;
  failure_category: string;
  auto_resolution_attempted: boolean;
  auto_resolution_successful: boolean | null;
  resolution_method: string | null;
  manual_intervention_required: boolean;
  resolution_notes: string | null;
  resolved_at: string | null;
}

interface CIPipelineStatusProps {
  sdId?: string;
  showAllSDs?: boolean;
}

const CIPipelineStatus: React.FC<CIPipelineStatusProps> = ({
  sdId,
  showAllSDs = false
}) => {
  const [pipelineStatuses, setPipelineStatuses] = useState<PipelineStatus[]>([]);
  const [cicdGates, setCiCdGates] = useState<CiCdGate[]>([]);
  const [failureResolutions, setFailureResolutions] = useState<FailureResolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const supabase = useSupabase();

  useEffect(() => {
    if (sdId || showAllSDs) {
      loadCiCdData();
    }
  }, [sdId, showAllSDs]);

  const loadCiCdData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadPipelineStatuses(),
        loadCiCdGates(),
        loadFailureResolutions()
      ]);
    } catch (error) {
      console.error('Failed to load CI/CD data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPipelineStatuses = async () => {
    let query = supabase
      .from('ci_cd_pipeline_status')
      .select('*')
      .order('created_at', { ascending: false });

    if (sdId) {
      query = query.eq('sd_id', sdId);
    }

    if (!showAllSDs) {
      query = query.limit(20);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to load pipeline statuses:', error);
    } else {
      setPipelineStatuses(data || []);
    }
  };

  const loadCiCdGates = async () => {
    let query = supabase
      .from('leo_phase_ci_cd_gates')
      .select('*')
      .order('phase_name');

    if (sdId) {
      query = query.eq('sd_id', sdId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to load CI/CD gates:', error);
    } else {
      setCiCdGates(data || []);
    }
  };

  const loadFailureResolutions = async () => {
    let query = supabase
      .from('ci_cd_failure_resolutions')
      .select('*')
      .order('created_at', { ascending: false });

    if (sdId) {
      query = query.eq('sd_id', sdId);
    }

    if (!showAllSDs) {
      query = query.limit(10);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to load failure resolutions:', error);
    } else {
      setFailureResolutions(data || []);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadCiCdData();
    setRefreshing(false);
  };

  const getStatusIcon = (status: string, conclusion: string | null) => {
    if (status === 'in_progress') {
      return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
    }
    if (conclusion === 'success') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (conclusion === 'failure') {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    if (conclusion === 'cancelled') {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
    return <Clock className="h-4 w-4 text-gray-400" />;
  };

  const getStatusBadge = (status: string, conclusion: string | null) => {
    if (status === 'in_progress') {
      return <Badge variant="secondary">Running</Badge>;
    }
    if (conclusion === 'success') {
      return <Badge className="bg-green-500">Success</Badge>;
    }
    if (conclusion === 'failure') {
      return <Badge variant="destructive">Failed</Badge>;
    }
    if (conclusion === 'cancelled') {
      return <Badge variant="outline">Cancelled</Badge>;
    }
    return <Badge variant="secondary">Pending</Badge>;
  };

  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case 'LEAD': return <Zap className="h-4 w-4" />;
      case 'PLAN': return <Database className="h-4 w-4" />;
      case 'EXEC': return <GitBranch className="h-4 w-4" />;
      case 'VERIFICATION': return <Shield className="h-4 w-4" />;
      case 'APPROVAL': return <CheckCircle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getValidationStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'text-green-600 bg-green-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'validating': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const truncateCommitMessage = (message: string, maxLength = 60) => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            CI/CD Pipeline Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-blue-600" />
                CI/CD Pipeline Status
                {sdId && <Badge variant="outline">{sdId}</Badge>}
              </CardTitle>
              <CardDescription>
                Real-time GitHub Actions pipeline monitoring and failure resolution
              </CardDescription>
            </div>
            <Button
              onClick={refreshData}
              disabled={refreshing}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pipelines" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="pipelines">Pipeline Runs</TabsTrigger>
              <TabsTrigger value="gates">LEO Gates</TabsTrigger>
              <TabsTrigger value="failures">Failures</TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
            </TabsList>

            <TabsContent value="pipelines" className="mt-4">
              <ScrollArea className="h-96">
                <div className="space-y-3">
                  {pipelineStatuses.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No pipeline runs found
                    </div>
                  ) : (
                    pipelineStatuses.map((pipeline) => (
                      <div key={pipeline.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(pipeline.status, pipeline.conclusion)}
                            <div>
                              <h4 className="font-medium">{pipeline.workflow_name}</h4>
                              <p className="text-sm text-gray-600">{pipeline.repository_name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(pipeline.status, pipeline.conclusion)}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(pipeline.workflow_url, '_blank')}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="text-sm text-gray-600 space-y-1">
                          <div className="flex items-center gap-2">
                            <GitBranch className="h-3 w-3" />
                            <span>{pipeline.branch_name}</span>
                            <code className="text-xs bg-gray-100 px-1 rounded">
                              {pipeline.commit_sha.substring(0, 7)}
                            </code>
                          </div>
                          <p className="truncate">{truncateCommitMessage(pipeline.commit_message)}</p>
                          <div className="flex justify-between">
                            <span>Started: {formatTimestamp(pipeline.started_at)}</span>
                            {pipeline.completed_at && (
                              <span>Completed: {formatTimestamp(pipeline.completed_at)}</span>
                            )}
                          </div>
                        </div>

                        {pipeline.failure_reason && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                            <p className="text-sm text-red-700">{pipeline.failure_reason}</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="gates" className="mt-4">
              <div className="space-y-4">
                {cicdGates.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No CI/CD gates configured
                  </div>
                ) : (
                  cicdGates.map((gate) => (
                    <div key={gate.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {getPhaseIcon(gate.phase_name)}
                          <div>
                            <h4 className="font-medium">{gate.phase_name} Phase</h4>
                            <p className="text-sm text-gray-600">Gate Type: {gate.gate_type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`px-2 py-1 rounded text-xs font-medium ${getValidationStatusColor(gate.validation_status)}`}>
                            {gate.validation_status}
                          </div>
                          <Badge variant="outline">{gate.validation_score}%</Badge>
                        </div>
                      </div>

                      {gate.validation_details && (
                        <div className="text-sm space-y-2">
                          {gate.validation_details.errors?.length > 0 && (
                            <div>
                              <p className="font-medium text-red-600">Errors:</p>
                              <ul className="list-disc list-inside text-red-600 ml-2">
                                {gate.validation_details.errors.map((error: string, idx: number) => (
                                  <li key={idx}>{error}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {gate.validation_details.warnings?.length > 0 && (
                            <div>
                              <p className="font-medium text-yellow-600">Warnings:</p>
                              <ul className="list-disc list-inside text-yellow-600 ml-2">
                                {gate.validation_details.warnings.map((warning: string, idx: number) => (
                                  <li key={idx}>{warning}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="text-gray-600">
                            <p>CI/CD Status: <span className="font-medium">{gate.validation_details.ci_cd_status}</span></p>
                            <p>Health Score: <span className="font-medium">{gate.validation_details.health_score}%</span></p>
                            <p>Active Failures: <span className="font-medium">{gate.validation_details.active_failures}</span></p>
                          </div>

                          <p className="text-xs text-gray-500">
                            Last validated: {formatTimestamp(gate.last_validation_at)}
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="failures" className="mt-4">
              <div className="space-y-4">
                {failureResolutions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No failure resolutions found
                  </div>
                ) : (
                  failureResolutions.map((resolution) => (
                    <div key={resolution.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-medium capitalize">
                            {resolution.failure_category.replace('_', ' ')} Failure
                          </h4>
                          <p className="text-sm text-gray-600">
                            Resolution Method: {resolution.resolution_method || 'Manual'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {resolution.auto_resolution_attempted && (
                            <Badge variant="outline">Auto-Attempted</Badge>
                          )}
                          {resolution.auto_resolution_successful && (
                            <Badge className="bg-green-500">Auto-Resolved</Badge>
                          )}
                          {resolution.manual_intervention_required && (
                            <Badge variant="destructive">Manual Required</Badge>
                          )}
                        </div>
                      </div>

                      {resolution.resolution_notes && (
                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                          <p className="text-sm text-blue-700">{resolution.resolution_notes}</p>
                        </div>
                      )}

                      <div className="mt-2 text-xs text-gray-500">
                        {resolution.resolved_at ? (
                          <span>Resolved: {formatTimestamp(resolution.resolved_at)}</span>
                        ) : (
                          <span>Status: In Progress</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="overview" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Pipeline Success Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {pipelineStatuses.length > 0
                        ? Math.round((pipelineStatuses.filter(p => p.conclusion === 'success').length / pipelineStatuses.length) * 100)
                        : 0}%
                    </div>
                    <p className="text-xs text-gray-600">
                      {pipelineStatuses.filter(p => p.conclusion === 'success').length} of {pipelineStatuses.length} successful
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Active Failures</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {pipelineStatuses.filter(p => p.conclusion === 'failure').length}
                    </div>
                    <p className="text-xs text-gray-600">
                      {failureResolutions.filter(r => !r.resolved_at).length} pending resolution
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">LEO Gate Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {cicdGates.filter(g => g.validation_status === 'passed').length}/{cicdGates.length}
                    </div>
                    <p className="text-xs text-gray-600">
                      Gates passing validation
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Separator className="my-6" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {pipelineStatuses.slice(0, 5).map((pipeline) => (
                        <div key={pipeline.id} className="flex items-center gap-2 text-sm">
                          {getStatusIcon(pipeline.status, pipeline.conclusion)}
                          <span className="truncate">{pipeline.workflow_name}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(pipeline.started_at).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Failure Categories</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Array.from(
                        failureResolutions.reduce((acc, resolution) => {
                          const category = resolution.failure_category;
                          acc.set(category, (acc.get(category) || 0) + 1);
                          return acc;
                        }, new Map())
                      ).map(([category, count]) => (
                        <div key={category} className="flex justify-between text-sm">
                          <span className="capitalize">{category.replace('_', ' ')}</span>
                          <Badge variant="outline">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CIPipelineStatus;