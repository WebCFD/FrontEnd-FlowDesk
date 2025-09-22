import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Database, CheckCircle, Clock, XCircle, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

// Types for admin APIs
interface AdminStats {
  totalUsers: number;
  totalSimulations: number;
  completedSimulations: number;
  processingSimulations: number;
  failedSimulations: number;
  totalCreditsUsed: number;
}

interface AdminUser {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  credits: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminSimulation {
  id: number;
  userId: number;
  name: string;
  filePath: string;
  status: 'processing' | 'completed' | 'failed';
  simulationType: 'comfort' | 'renovation';
  packageType: 'basic' | 'professional' | 'enterprise';
  cost: string;
  isPublic: boolean;
  createdAt: string;
  completedAt?: string;
  updatedAt: string;
  user: {
    username: string;
    email: string;
  };
}

const StatusBadge = ({ status }: { status: string }) => {
  const variants = {
    completed: 'default',
    processing: 'secondary',
    failed: 'destructive'
  } as const;

  const icons = {
    completed: CheckCircle,
    processing: Clock,
    failed: XCircle
  };

  const Icon = icons[status as keyof typeof icons] || Clock;

  return (
    <Badge 
      variant={variants[status as keyof typeof variants] || 'secondary'} 
      className="flex items-center gap-1"
    >
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
};

const SimulationTypeBadge = ({ type }: { type: string }) => (
  <Badge variant="outline">
    {type === 'comfort' ? 'Comfort' : 'Renovation'}
  </Badge>
);

export default function AdminPage() {
  // Fetch admin stats
  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['/api/admin/stats'],
  });

  // Fetch all users
  const { data: users, isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ['/api/admin/users'],
  });

  // Fetch all simulations
  const { data: simulations, isLoading: simulationsLoading } = useQuery<AdminSimulation[]>({
    queryKey: ['/api/admin/simulations'],
  });

  if (statsLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Cargando datos de administración...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold" data-testid="heading-admin-panel">Panel de Administración</h1>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card data-testid="card-total-users">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Usuarios</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-users">{stats.totalUsers}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-total-simulations">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Simulaciones</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-simulations">{stats.totalSimulations}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-completed-simulations">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completadas</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-completed-simulations">{stats.completedSimulations}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-processing-simulations">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Procesando</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="text-processing-simulations">{stats.processingSimulations}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-failed-simulations">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fallidas</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600" data-testid="text-failed-simulations">{stats.failedSimulations}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-total-credits">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Créditos Usados</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-credits">€{stats.totalCreditsUsed.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Users Table */}
      <Card data-testid="card-users-table">
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
          <CardDescription>Lista de todos los usuarios registrados</CardDescription>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="flex items-center justify-center h-32">
              <div>Cargando usuarios...</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Créditos</TableHead>
                  <TableHead>Fecha de Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell data-testid={`text-user-id-${user.id}`}>{user.id}</TableCell>
                    <TableCell data-testid={`text-username-${user.id}`}>{user.username}</TableCell>
                    <TableCell data-testid={`text-email-${user.id}`}>{user.email}</TableCell>
                    <TableCell data-testid={`text-fullname-${user.id}`}>{user.fullName || '-'}</TableCell>
                    <TableCell data-testid={`text-credits-${user.id}`}>€{parseFloat(user.credits).toFixed(2)}</TableCell>
                    <TableCell data-testid={`text-created-${user.id}`}>{format(new Date(user.createdAt), 'dd/MM/yyyy')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Simulations Table */}
      <Card data-testid="card-simulations-table">
        <CardHeader>
          <CardTitle>Simulaciones</CardTitle>
          <CardDescription>Lista de todas las simulaciones del sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {simulationsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div>Cargando simulaciones...</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Costo</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {simulations?.map((sim) => (
                  <TableRow key={sim.id} data-testid={`row-simulation-${sim.id}`}>
                    <TableCell data-testid={`text-sim-id-${sim.id}`}>{sim.id}</TableCell>
                    <TableCell data-testid={`text-sim-name-${sim.id}`} className="max-w-xs truncate">{sim.name}</TableCell>
                    <TableCell data-testid={`text-sim-user-${sim.id}`}>{sim.user.username}</TableCell>
                    <TableCell data-testid={`badge-sim-type-${sim.id}`}>
                      <SimulationTypeBadge type={sim.simulationType} />
                    </TableCell>
                    <TableCell data-testid={`badge-sim-status-${sim.id}`}>
                      <StatusBadge status={sim.status} />
                    </TableCell>
                    <TableCell data-testid={`text-sim-cost-${sim.id}`}>€{parseFloat(sim.cost).toFixed(2)}</TableCell>
                    <TableCell data-testid={`text-sim-date-${sim.id}`}>{format(new Date(sim.createdAt), 'dd/MM/yyyy')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}