import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import NavigationHeader from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { Download, File, ClipboardList, Bot, Clock, TrendingUp, TrendingDown } from "lucide-react";
import type { Claim } from "@/types";
import { identify, track } from "@/lib/mixpanel-browser";

export default function InsurerDashboard() {
  const { t } = useTranslation();
  const [seasonFilter, setSeasonFilter] = useState<string | null>("kharif");
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);

  const { data: dashboardData, isLoading } = useQuery<{
    stats?: {
      totalPolicies?: number;
      activeClaims?: number;
      autoApprovalRate?: number;
      avgSettlementTime?: number;
    };
    recentClaims?: Claim[];
  }>({
    queryKey: ["/api/dashboard/insurer"],
  });

  const stats = dashboardData?.stats;
  const recentClaims = dashboardData?.recentClaims || [];

  useEffect(() => {
    identify("insurer_console", {
      $name: "Insurer Console",
      $email: "console@cropguard.demo",
      organization_id: "org_cropguard_demo",
      role: "claims_manager",
      districts_managed: ["Latur", "Barmer", "Ludhiana"],
      created_at: new Date().toISOString(),
    });
    track("insurer_signed_in", {
      organization_id: "org_cropguard_demo",
      role: "claims_manager",
    });
  }, []);

  useEffect(() => {
    if (isLoading) return;
    track("policy_list_viewed", {
      filter_district: districtFilter,
      filter_season: seasonFilter,
      filter_crop_type: null,
      result_count: stats?.totalPolicies ?? recentClaims.length,
    });
  }, [isLoading, stats?.totalPolicies, recentClaims.length, districtFilter, seasonFilter]);

  const getClaimStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
      case 'settled':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationHeader />
      
      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{t('insurer_analytics_dashboard')}</h1>
              <p className="text-gray-600">{t('real_time_insights')}</p>
            </div>
            <div className="flex items-center space-x-4">
              <Select
                defaultValue="30"
                onValueChange={(v) => {
                  setSeasonFilter(v === "365" ? "kharif" : seasonFilter);
                  setDistrictFilter(districtFilter);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">{t('last_30_days')}</SelectItem>
                  <SelectItem value="90">{t('last_90_days')}</SelectItem>
                  <SelectItem value="365">{t('this_season')}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => {
                  track("parametric_rule_updated", {
                    rule_type: "dry_day_count",
                    old_value: 21,
                    new_value: 21,
                    district: districtFilter || "Latur",
                  });
                }}
              >
                Parametric rules
              </Button>
              <Button
                className="bg-hsl(207, 90%, 54%) hover:bg-hsl(207, 90%, 49%)"
                onClick={() => {
                  track("report_exported", {
                    report_type: "claims_overview",
                    district: districtFilter || "all",
                    season: seasonFilter || "kharif",
                    format: "csv",
                  });
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                {t('export_report')}
              </Button>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">{t('total_policies')}</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {isLoading ? <Skeleton className="h-8 w-16" /> : stats?.totalPolicies?.toLocaleString() || '0'}
                    </p>
                    <p className="text-sm text-green-600 flex items-center mt-1">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      12% {t('from_last_month')}
                    </p>
                  </div>
                  <File className="h-8 w-8 text-hsl(142, 71%, 45%)" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">{t('active_claims')}</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {isLoading ? <Skeleton className="h-8 w-12" /> : stats?.activeClaims || '0'}
                    </p>
                    <p className="text-sm text-orange-600 flex items-center mt-1">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      8% {t('from_last_month')}
                    </p>
                  </div>
                  <ClipboardList className="h-8 w-8 text-hsl(207, 90%, 54%)" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">{t('auto_approval_rate')}</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {isLoading ? <Skeleton className="h-8 w-16" /> : `${stats?.autoApprovalRate || 0}%`}
                    </p>
                    <p className="text-sm text-green-600 flex items-center mt-1">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      2.1% {t('from_last_month')}
                    </p>
                  </div>
                  <Bot className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">{t('avg_settlement_time')}</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {isLoading ? <Skeleton className="h-8 w-12" /> : `${stats?.avgSettlementTime || 0}h`}
                    </p>
                    <p className="text-sm text-green-600 flex items-center mt-1">
                      <TrendingDown className="w-3 h-3 mr-1" />
                      67% {t('from_last_month')}
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-hsl(33, 100%, 50%)" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts and Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Claims Overview Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-semibold">{t('claims_processing_overview')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <div className="text-4xl mb-2">📊</div>
                    <p>{t('interactive_claims_chart')}</p>
                    <p className="text-sm mt-2">{t('chart_implementation_note')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-semibold">{t('risk_distribution_region')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <div className="text-4xl mb-2">🗺️</div>
                    <p>{t('risk_heat_map')}</p>
                    <p className="text-sm mt-2">{t('map_implementation_note')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Claims Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">{t('recent_claims')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('claim_id')}</TableHead>
                      <TableHead>{t('farmer')}</TableHead>
                      <TableHead>{t('location')}</TableHead>
                      <TableHead>{t('amount')}</TableHead>
                      <TableHead>{t('status')}</TableHead>
                      <TableHead>{t('processing_time')}</TableHead>
                      <TableHead>{t('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentClaims.map((claim: Claim) => (
                      <TableRow key={claim.id}>
                        <TableCell className="font-medium">{claim.claimNumber}</TableCell>
                        <TableCell>Farmer {claim.farmerId}</TableCell>
                        <TableCell>District, State</TableCell>
                        <TableCell>{formatCurrency(parseFloat(claim.claimAmount || '0'))}</TableCell>
                        <TableCell>
                          <Badge className={getClaimStatusColor(claim.status)}>
                            {t(claim.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {claim.settlementTime ? `${claim.settlementTime} hours` : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const status =
                                  claim.status === "settled"
                                    ? "settled"
                                    : claim.status === "rejected"
                                      ? "rejected"
                                      : claim.status === "approved"
                                        ? "payout_triggered"
                                        : "pending_evidence";
                                track("policy_detail_viewed", {
                                  policy_id: String(claim.policyId || claim.id),
                                  district: "unknown",
                                  crop_type: "unknown",
                                  status,
                                });
                                track("evidence_inspected", {
                                  policy_id: String(claim.policyId || claim.id),
                                  evidence_type: "photo",
                                  review_outcome: "pending",
                                });
                              }}
                            >
                              {t('view')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-hsl(142, 71%, 45%)"
                              onClick={() => {
                                track("claim_debugged", {
                                  policy_id: String(claim.policyId || claim.id),
                                  issue_type: "manual_audit",
                                  resolution_action: "opened_audit_trail",
                                });
                                if (claim.status === "approved" || claim.status === "settled") {
                                  track("claim_approved", {
                                    policy_id: String(claim.policyId || claim.id),
                                    payout_amount: parseFloat(claim.claimAmount || "0"),
                                    district: "unknown",
                                    crop_type: "unknown",
                                  });
                                } else if (claim.status === "rejected") {
                                  track("claim_rejected", {
                                    policy_id: String(claim.policyId || claim.id),
                                    rejection_reason: claim.reasonCode || "manual_review",
                                    district: "unknown",
                                  });
                                }
                              }}
                            >
                              {t('audit')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {!isLoading && recentClaims.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">{t('no_recent_claims')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
