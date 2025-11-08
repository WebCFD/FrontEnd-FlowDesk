import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Database, CheckCircle, Clock, XCircle, DollarSign, Lock, Filter, Activity, Cpu, Server } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Helper function to get status color
function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'text-green-600';
    case 'stopped':
      return 'text-red-600';
    default:
      return 'text-yellow-600';
  }
}

// Helper function to get status icon
function getStatusIcon(status: string): string {
  switch (status) {
    case 'running':
      return '🟢';
    case 'stopped':
      return '🔴';
    default:
      return '🟡';
  }
}

// Types for admin APIs
interface AdminStats {
  totalUsers: number;
  totalSimulations: number;
  completedSimulations: number;
  processingSimulations: number;
  failedSimulations: number;
  totalCreditsUsed: number;
}

interface WorkerHealth {
  status: string;
  lastSeen?: string;
  pid?: number;
}

interface WorkersStatus {
  express: {
    status: string;
    uptime: number;
    timestamp: string;
  };
  worker_submit: WorkerHealth;
  worker_monitor: WorkerHealth;
  system: {
    nodeVersion: string;
    platform: string;
    memory: {
      used: number;
      total: number;
      unit: string;
    };
  };
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
  jsonConfig?: any; // JSON configuration data
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

// Login form component
const DatabaseLoginForm = ({ onLogin }: { onLogin: (password: string) => void }) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (password === 'flowerpower') {
      onLogin(password);
      toast({
        title: "Acceso concedido",
        description: "Bienvenido al panel de administración de base de datos",
      });
    } else {
      toast({
        title: "Contraseña incorrecta",
        description: "Ingrese la contraseña correcta para acceder",
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  };

  return (
    <div className="container mx-auto p-6 max-w-md">
      <Card data-testid="card-database-login">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Lock className="h-12 w-12 text-muted-foreground" />
          </div>
          <CardTitle>Acceso a Base de Datos</CardTitle>
          <CardDescription>
            Ingrese la contraseña para acceder al panel de administración de la base de datos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingrese la contraseña"
                data-testid="input-database-password"
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
              data-testid="button-database-login"
            >
              {isLoading ? "Verificando..." : "Acceder"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// Main admin database component
const AdminDatabasePanel = ({ authToken }: { authToken: string }) => {
  // Filter states
  const [userFilters, setUserFilters] = useState({
    username: '',
    email: '',
    fullName: '',
  });

  const [simulationFilters, setSimulationFilters] = useState({
    name: '',
    username: '',
    email: '',
    status: '',
    simulationType: '',
  });
  // Fetch admin stats with auth token
  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['/api/admindatabase/stats'],
    queryFn: async () => {
      const response = await fetch('/api/admindatabase/stats', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    }
  });

  // Fetch all users with auth token
  const { data: users, isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ['/api/admindatabase/users'],
    queryFn: async () => {
      const response = await fetch('/api/admindatabase/users', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    }
  });

  // Fetch all simulations with auth token
  const { data: simulations, isLoading: simulationsLoading } = useQuery<AdminSimulation[]>({
    queryKey: ['/api/admindatabase/simulations'],
    queryFn: async () => {
      const response = await fetch('/api/admindatabase/simulations', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch simulations');
      return response.json();
    }
  });

  // Fetch workers status with auto-refresh every 10 seconds
  const { data: workersStatus, isLoading: workersLoading } = useQuery<WorkersStatus>({
    queryKey: ['/api/admindatabase/workers'],
    queryFn: async () => {
      const response = await fetch('/api/admindatabase/workers', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch workers status');
      return response.json();
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  // Filtered data using useMemo for performance
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    
    return users.filter(user => {
      return (
        user.username.toLowerCase().includes(userFilters.username.toLowerCase()) &&
        user.email.toLowerCase().includes(userFilters.email.toLowerCase()) &&
        (user.fullName || '').toLowerCase().includes(userFilters.fullName.toLowerCase())
      );
    });
  }, [users, userFilters]);

  const filteredSimulations = useMemo(() => {
    if (!simulations) return [];
    
    return simulations.filter(sim => {
      return (
        sim.name.toLowerCase().includes(simulationFilters.name.toLowerCase()) &&
        sim.user.username.toLowerCase().includes(simulationFilters.username.toLowerCase()) &&
        sim.user.email.toLowerCase().includes(simulationFilters.email.toLowerCase()) &&
        sim.status.toLowerCase().includes(simulationFilters.status.toLowerCase()) &&
        sim.simulationType.toLowerCase().includes(simulationFilters.simulationType.toLowerCase())
      );
    });
  }, [simulations, simulationFilters]);

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
        <h1 className="text-3xl font-bold" data-testid="heading-admindatabase-panel">Panel de Administración - Base de Datos</h1>
        <Badge variant="secondary" className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          Acceso Total
        </Badge>
      </div>

      {/* Workers Status Cards */}
      {workersStatus && (
        <>
          <div className="border-b pb-2">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Estado de Workers
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-worker-express">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Express Server</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getStatusColor(workersStatus.express.status)}`}>
                  {getStatusIcon(workersStatus.express.status)} {workersStatus.express.status}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Uptime: {formatUptime(workersStatus.express.uptime)}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-worker-submit">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Worker Submit</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getStatusColor(workersStatus.worker_submit.status)}`}>
                  {getStatusIcon(workersStatus.worker_submit.status)} {workersStatus.worker_submit.status}
                </div>
                {workersStatus.worker_submit.pid && (
                  <p className="text-xs text-muted-foreground mt-1">
                    PID: {workersStatus.worker_submit.pid}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-worker-monitor">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Worker Monitor</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getStatusColor(workersStatus.worker_monitor.status)}`}>
                  {getStatusIcon(workersStatus.worker_monitor.status)} {workersStatus.worker_monitor.status}
                </div>
                {workersStatus.worker_monitor.pid && (
                  <p className="text-xs text-muted-foreground mt-1">
                    PID: {workersStatus.worker_monitor.pid}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-system-info">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Info</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {workersStatus.system.memory.used} {workersStatus.system.memory.unit}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Node {workersStatus.system.nodeVersion}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Database Stats Cards */}
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
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Usuarios
            <Badge variant="secondary">{filteredUsers.length} / {users?.length || 0}</Badge>
          </CardTitle>
          <CardDescription>Lista completa de todos los usuarios registrados con filtros</CardDescription>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="flex items-center justify-center h-32">
              <div>Cargando usuarios...</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>
                      <div className="space-y-1">
                        <div>Usuario</div>
                        <Input
                          placeholder="Filtrar..."
                          value={userFilters.username}
                          onChange={(e) => setUserFilters({...userFilters, username: e.target.value})}
                          className="h-7 text-xs"
                          data-testid="filter-username"
                        />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="space-y-1">
                        <div>Email</div>
                        <Input
                          placeholder="Filtrar..."
                          value={userFilters.email}
                          onChange={(e) => setUserFilters({...userFilters, email: e.target.value})}
                          className="h-7 text-xs"
                          data-testid="filter-user-email"
                        />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="space-y-1">
                        <div>Nombre Completo</div>
                        <Input
                          placeholder="Filtrar..."
                          value={userFilters.fullName}
                          onChange={(e) => setUserFilters({...userFilters, fullName: e.target.value})}
                          className="h-7 text-xs"
                          data-testid="filter-fullname"
                        />
                      </div>
                    </TableHead>
                    <TableHead>Créditos</TableHead>
                    <TableHead>Fecha Registro</TableHead>
                    <TableHead>Última Actualización</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell data-testid={`text-user-id-${user.id}`}>{user.id}</TableCell>
                      <TableCell data-testid={`text-username-${user.id}`}>{user.username}</TableCell>
                      <TableCell data-testid={`text-email-${user.id}`}>{user.email}</TableCell>
                      <TableCell data-testid={`text-fullname-${user.id}`}>{user.fullName || '-'}</TableCell>
                      <TableCell data-testid={`text-credits-${user.id}`}>€{parseFloat(user.credits).toFixed(2)}</TableCell>
                      <TableCell data-testid={`text-created-${user.id}`}>{format(new Date(user.createdAt), 'dd/MM/yyyy HH:mm')}</TableCell>
                      <TableCell data-testid={`text-updated-${user.id}`}>{format(new Date(user.updatedAt), 'dd/MM/yyyy HH:mm')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Simulations Table */}
      <Card data-testid="card-simulations-table">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Simulaciones
            <Badge variant="secondary">{filteredSimulations.length} / {simulations?.length || 0}</Badge>
          </CardTitle>
          <CardDescription>Lista completa de todas las simulaciones con filtros en tiempo real</CardDescription>
        </CardHeader>
        <CardContent>
          {simulationsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div>Cargando simulaciones...</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>
                      <div className="space-y-1">
                        <div>Nombre</div>
                        <Input
                          placeholder="Filtrar..."
                          value={simulationFilters.name}
                          onChange={(e) => setSimulationFilters({...simulationFilters, name: e.target.value})}
                          className="h-7 text-xs"
                          data-testid="filter-sim-name"
                        />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="space-y-1">
                        <div>Usuario</div>
                        <Input
                          placeholder="Filtrar..."
                          value={simulationFilters.username}
                          onChange={(e) => setSimulationFilters({...simulationFilters, username: e.target.value})}
                          className="h-7 text-xs"
                          data-testid="filter-sim-username"
                        />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span>Email Usuario</span>
                          <Filter className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <Input
                          placeholder="Filtrar por email..."
                          value={simulationFilters.email}
                          onChange={(e) => setSimulationFilters({...simulationFilters, email: e.target.value})}
                          className="h-7 text-xs"
                          data-testid="filter-sim-email"
                        />
                      </div>
                    </TableHead>
                    <TableHead>File Path</TableHead>
                    <TableHead>
                      <div className="space-y-1">
                        <div>Estado</div>
                        <Input
                          placeholder="Filtrar..."
                          value={simulationFilters.status}
                          onChange={(e) => setSimulationFilters({...simulationFilters, status: e.target.value})}
                          className="h-7 text-xs"
                          data-testid="filter-sim-status"
                        />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="space-y-1">
                        <div>Tipo Simulación</div>
                        <Input
                          placeholder="Filtrar..."
                          value={simulationFilters.simulationType}
                          onChange={(e) => setSimulationFilters({...simulationFilters, simulationType: e.target.value})}
                          className="h-7 text-xs"
                          data-testid="filter-sim-type"
                        />
                      </div>
                    </TableHead>
                    <TableHead>Tipo Paquete</TableHead>
                    <TableHead>Costo</TableHead>
                    <TableHead>Público</TableHead>
                    <TableHead>Fecha Creación</TableHead>
                    <TableHead>Fecha Completado</TableHead>
                    <TableHead>Última Actualización</TableHead>
                    <TableHead>Config JSON</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSimulations.map((sim) => (
                    <TableRow key={sim.id} data-testid={`row-simulation-${sim.id}`}>
                      <TableCell data-testid={`text-sim-id-${sim.id}`}>{sim.id}</TableCell>
                      <TableCell data-testid={`text-sim-name-${sim.id}`} className="max-w-xs">
                        <div className="truncate" title={sim.name}>{sim.name}</div>
                      </TableCell>
                      <TableCell data-testid={`text-sim-user-${sim.id}`}>{sim.user.username}</TableCell>
                      <TableCell data-testid={`text-sim-user-email-${sim.id}`}>{sim.user.email}</TableCell>
                      <TableCell data-testid={`text-sim-filepath-${sim.id}`} className="max-w-xs">
                        <div className="truncate text-xs font-mono" title={sim.filePath}>{sim.filePath}</div>
                      </TableCell>
                      <TableCell data-testid={`badge-sim-status-${sim.id}`}>
                        <StatusBadge status={sim.status} />
                      </TableCell>
                      <TableCell data-testid={`badge-sim-type-${sim.id}`}>
                        <SimulationTypeBadge type={sim.simulationType} />
                      </TableCell>
                      <TableCell data-testid={`text-sim-package-${sim.id}`}>
                        <Badge variant="outline">{sim.packageType}</Badge>
                      </TableCell>
                      <TableCell data-testid={`text-sim-cost-${sim.id}`}>€{parseFloat(sim.cost).toFixed(2)}</TableCell>
                      <TableCell data-testid={`text-sim-public-${sim.id}`}>
                        {sim.isPublic ? (
                          <Badge variant="secondary">Público</Badge>
                        ) : (
                          <Badge variant="outline">Privado</Badge>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-sim-created-${sim.id}`}>
                        {format(new Date(sim.createdAt), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                      <TableCell data-testid={`text-sim-completed-${sim.id}`}>
                        {sim.completedAt ? format(new Date(sim.completedAt), 'dd/MM/yyyy HH:mm') : '-'}
                      </TableCell>
                      <TableCell data-testid={`text-sim-updated-${sim.id}`}>
                        {format(new Date(sim.updatedAt), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                      <TableCell data-testid={`text-sim-json-${sim.id}`}>
                        {sim.jsonConfig ? (
                          <Badge variant="secondary" className="cursor-pointer" title="Click para ver JSON">
                            JSON disponible
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Main component
export default function AdminDatabasePage() {
  const [authToken, setAuthToken] = useState<string | null>(null);

  const handleLogin = (password: string) => {
    // Generate a simple token for session management
    setAuthToken(password);
  };

  if (!authToken) {
    return <DatabaseLoginForm onLogin={handleLogin} />;
  }

  return <AdminDatabasePanel authToken={authToken} />;
}