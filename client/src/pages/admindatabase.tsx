import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Users, Database, CheckCircle, Clock, XCircle, DollarSign, Lock, Filter, Activity, Cpu, Server, Edit, Trash2, Info, HardDrive } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
    disk: {
      used: number;
      total: number;
      unit: string;
    };
    uploads: {
      size: number;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Calcular hash SHA-256 del password
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Hash SHA-256 de la contraseña correcta "flowerpower"
      const ADMIN_PASSWORD_HASH = "b49f2bc773151f63cead40e9fb5bf30a70dbe79e2fdbef56ebe64d3db2f6a536";
      
      if (passwordHash === ADMIN_PASSWORD_HASH) {
        onLogin(passwordHash);
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
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al procesar la contraseña",
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

// Edit User Modal Component
const EditUserModal = ({ user, authToken, open, onOpenChange }: { 
  user: AdminUser; 
  authToken: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { toast } = useToast();
  const [fullName, setFullName] = useState(user.fullName || '');
  const [credits, setCredits] = useState(parseFloat(user.credits).toString());

  const updateUserMutation = useMutation({
    mutationFn: async (data: { fullName?: string; credits?: string }) => {
      const response = await fetch(`/api/admindatabase/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update user');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admindatabase/users'] });
      toast({ title: "Usuario actualizado", description: "Los cambios se han guardado correctamente" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar el usuario", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserMutation.mutate({ fullName, credits });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-edit-user">
        <DialogHeader>
          <DialogTitle>Editar Usuario</DialogTitle>
          <DialogDescription>Modificar información del usuario {user.username}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre Completo</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nombre completo del usuario"
              data-testid="input-edit-fullname"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="credits">Créditos (€)</Label>
            <Input
              id="credits"
              type="number"
              step="0.01"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              placeholder="0.00"
              data-testid="input-edit-credits"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-edit">
              Cancelar
            </Button>
            <Button type="submit" disabled={updateUserMutation.isPending} data-testid="button-save-user">
              {updateUserMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Edit Simulation Modal Component
const EditSimulationModal = ({ simulation, authToken, open, onOpenChange }: { 
  simulation: AdminSimulation; 
  authToken: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { toast } = useToast();
  const [status, setStatus] = useState(simulation.status);
  const [cost, setCost] = useState(parseFloat(simulation.cost).toString());
  const [isPublic, setIsPublic] = useState(simulation.isPublic);

  const updateSimulationMutation = useMutation({
    mutationFn: async (data: { status?: string; cost?: string; isPublic?: boolean }) => {
      const response = await fetch(`/api/admindatabase/simulations/${simulation.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update simulation');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admindatabase/simulations'] });
      toast({ title: "Simulación actualizada", description: "Los cambios se han guardado correctamente" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar la simulación", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSimulationMutation.mutate({ status, cost, isPublic });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-edit-simulation">
        <DialogHeader>
          <DialogTitle>Editar Simulación</DialogTitle>
          <DialogDescription>Modificar información de la simulación {simulation.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="status">Estado</Label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full h-10 px-3 py-2 text-sm border rounded-md"
              data-testid="select-edit-status"
            >
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="geometry">Geometry</option>
              <option value="meshing">Meshing</option>
              <option value="cfd_setup">CFD Setup</option>
              <option value="cloud_execution">Cloud Execution</option>
              <option value="post_processing">Post Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cost">Costo (€)</Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
              data-testid="input-edit-cost"
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              id="isPublic"
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4"
              data-testid="checkbox-edit-public"
            />
            <Label htmlFor="isPublic">Simulación Pública</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-edit-sim">
              Cancelar
            </Button>
            <Button type="submit" disabled={updateSimulationMutation.isPending} data-testid="button-save-simulation">
              {updateSimulationMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Delete Confirmation Dialog Component
const DeleteConfirmDialog = ({ 
  open, 
  onOpenChange, 
  onConfirm, 
  title, 
  description,
  isPending
}: { 
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  isPending: boolean;
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-delete-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending} data-testid="button-confirm-delete">
            {isPending ? 'Eliminando...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Main admin database component
const AdminDatabasePanel = ({ authToken }: { authToken: string }) => {
  const { toast } = useToast();

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

  // Edit/Delete states
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editingSimulation, setEditingSimulation] = useState<AdminSimulation | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [deletingSimulation, setDeletingSimulation] = useState<AdminSimulation | null>(null);

  // Delete mutations
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch(`/api/admindatabase/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (!response.ok) throw new Error('Failed to delete user');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admindatabase/users'] });
      toast({ title: "Usuario eliminado", description: "El usuario ha sido eliminado correctamente" });
      setDeletingUser(null);
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar el usuario", variant: "destructive" });
    },
  });

  const deleteSimulationMutation = useMutation({
    mutationFn: async (simulationId: number) => {
      const response = await fetch(`/api/admindatabase/simulations/${simulationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (!response.ok) throw new Error('Failed to delete simulation');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admindatabase/simulations'] });
      toast({ title: "Simulación eliminada", description: "La simulación ha sido eliminada correctamente" });
      setDeletingSimulation(null);
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar la simulación", variant: "destructive" });
    },
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
                <div className="flex items-center gap-1">
                  <CardTitle className="text-sm font-medium">Express Server</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-semibold">Servidor Web Principal</p>
                        <p className="text-xs">API backend que maneja todas las peticiones de usuarios (login, simulaciones, datos). Si cae, toda la aplicación deja de funcionar.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
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
                <div className="flex items-center gap-1">
                  <CardTitle className="text-sm font-medium">Worker Submit</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-semibold">⚠️ CRÍTICO - Procesador de Simulaciones</p>
                        <p className="text-xs">Toma simulaciones pendientes, genera geometría, crea malla y las envía a Inductiva. Si cae: simulaciones pendientes NO se procesan y usuarios esperan indefinidamente.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
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
                <div className="flex items-center gap-1">
                  <CardTitle className="text-sm font-medium">Worker Monitor</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-semibold">⚠️ CRÍTICO - Monitor de Resultados</p>
                        <p className="text-xs">Vigila simulaciones en Inductiva, descarga resultados completados y genera visualizaciones VTK. Si cae: resultados completados NO se descargan = pérdida de dinero.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
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
                <TooltipProvider>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-muted-foreground">Memoria RAM</div>
                        <div className="text-lg font-bold">
                          {workersStatus.system.memory.used}/{workersStatus.system.memory.total} {workersStatus.system.memory.unit}
                        </div>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-semibold">Memoria del Sistema</p>
                          <p className="text-xs">RAM total del servidor. Calculado con os.totalmem() y os.freemem(). Valor fijo que no varía.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {workersStatus.system.disk && (
                      <div className="flex items-center gap-1">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-muted-foreground">Disco Sistema</div>
                          <div className="text-lg font-bold">
                            {workersStatus.system.disk.used}/{workersStatus.system.disk.total} {workersStatus.system.disk.unit}
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-semibold">Disco del Servidor</p>
                            <p className="text-xs">Espacio total del sistema de archivos raíz (/). Calculado con df -BG /. Incluye sistema operativo, aplicación y archivos temporales.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                    {workersStatus.system.uploads && (
                      <div className="flex items-center gap-1">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-muted-foreground">Simulaciones</div>
                          <div className="text-lg font-bold">
                            {workersStatus.system.uploads.size} {workersStatus.system.uploads.unit}
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-semibold">Espacio de Simulaciones</p>
                            <p className="text-xs">Espacio usado por resultados de simulaciones en /public/uploads/. Calculado con du -sm. Incluye archivos VTK, imágenes y reportes PDF. ⚠️ CRÍTICO: Si crece mucho puede llenar el disco.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground pt-1">
                      Node {workersStatus.system.nodeVersion}
                    </p>
                  </div>
                </TooltipProvider>
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
                    <TableHead>Acciones</TableHead>
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingUser(user)}
                            data-testid={`button-edit-user-${user.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeletingUser(user)}
                            data-testid={`button-delete-user-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
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
                    <TableHead>Acciones</TableHead>
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingSimulation(sim)}
                            data-testid={`button-edit-simulation-${sim.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeletingSimulation(sim)}
                            data-testid={`button-delete-simulation-${sim.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          authToken={authToken}
          open={!!editingUser}
          onOpenChange={(open) => !open && setEditingUser(null)}
        />
      )}

      {/* Edit Simulation Modal */}
      {editingSimulation && (
        <EditSimulationModal
          simulation={editingSimulation}
          authToken={authToken}
          open={!!editingSimulation}
          onOpenChange={(open) => !open && setEditingSimulation(null)}
        />
      )}

      {/* Delete User Dialog */}
      {deletingUser && (
        <DeleteConfirmDialog
          open={!!deletingUser}
          onOpenChange={(open) => !open && setDeletingUser(null)}
          onConfirm={() => deleteUserMutation.mutate(deletingUser.id)}
          title="Eliminar Usuario"
          description={`¿Estás seguro de que quieres eliminar al usuario ${deletingUser.username}? Esta acción no se puede deshacer.`}
          isPending={deleteUserMutation.isPending}
        />
      )}

      {/* Delete Simulation Dialog */}
      {deletingSimulation && (
        <DeleteConfirmDialog
          open={!!deletingSimulation}
          onOpenChange={(open) => !open && setDeletingSimulation(null)}
          onConfirm={() => deleteSimulationMutation.mutate(deletingSimulation.id)}
          title="Eliminar Simulación"
          description={`¿Estás seguro de que quieres eliminar la simulación "${deletingSimulation.name}"? Esta acción no se puede deshacer.`}
          isPending={deleteSimulationMutation.isPending}
        />
      )}
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