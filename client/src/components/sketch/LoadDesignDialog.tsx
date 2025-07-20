import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LoadDesignDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (designData: any) => void;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  preview?: {
    version: string;
    floorCount: number;
    floors: string[];
    floorDetails: Array<{
      name: string;
      airEntryCount: number;
      wallCount: number;
      stairCount: number;
    }>;
  };
}

export default function LoadDesignDialog({
  isOpen,
  onClose,
  onLoad,
}: LoadDesignDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateDesignData = (data: any): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Verificar estructura básica
    if (!data || typeof data !== 'object') {
      errors.push("El archivo no contiene datos válidos");
      return { isValid: false, errors, warnings };
    }

    if (!data.version) {
      errors.push("Falta información de versión");
    }

    if (!data.floors || typeof data.floors !== 'object') {
      errors.push("No se encontraron datos de plantas");
      return { isValid: false, errors, warnings };
    }

    // Verificar cada planta
    const floorKeys = Object.keys(data.floors);
    if (floorKeys.length === 0) {
      errors.push("No hay plantas definidas en el diseño");
      return { isValid: false, errors, warnings };
    }

    // Validar estructura de cada planta y recopilar detalles
    const floorDetails: Array<{name: string; airEntryCount: number; wallCount: number; stairCount: number}> = [];
    
    for (const floorKey of floorKeys) {
      const floor = data.floors[floorKey];
      
      if (!floor || typeof floor !== 'object') {
        errors.push(`Planta ${floorKey}: Datos inválidos`);
        continue;
      }

      if (typeof floor.height !== 'number') {
        errors.push(`Planta ${floorKey}: Altura no válida`);
      }

      if (typeof floor.floorDeck !== 'number') {
        warnings.push(`Planta ${floorKey}: Floor Deck no definido`);
      }

      if (!Array.isArray(floor.walls)) {
        errors.push(`Planta ${floorKey}: Paredes no válidas`);
      }

      // Contar Air Entries en formato nuevo (dentro de walls) y formato antiguo (directo en floor)
      let airEntryCount = 0;
      
      // Formato nuevo: air entries dentro de walls
      if (Array.isArray(floor.walls)) {
        floor.walls.forEach((wall: any) => {
          if (Array.isArray(wall.airEntries)) {
            airEntryCount += wall.airEntries.length;
          }
        });
      }
      
      // Formato antiguo: air entries directamente en floor
      if (Array.isArray(floor.airEntries)) {
        airEntryCount += floor.airEntries.length;
      }
      
      // Contar vents horizontales (ceiling y floor_surf)
      let horizontalVentCount = 0;
      if (floor.ceiling?.airEntries) {
        horizontalVentCount += floor.ceiling.airEntries.filter((entry: any) => entry.type === 'vent').length;
      }
      if (floor.floor_surf?.airEntries) {
        horizontalVentCount += floor.floor_surf.airEntries.filter((entry: any) => entry.type === 'vent').length;
      }
      
      // Sumar vents horizontales al total de air entries
      airEntryCount += horizontalVentCount;
      
      // Contar walls y stairs
      const wallCount = Array.isArray(floor.walls) ? floor.walls.length : 0;
      const stairCount = Array.isArray(floor.stairs) ? floor.stairs.length : 0;
      
      // Contar furniture 3D elements
      const furnitureCount = Array.isArray(floor.furniture) ? floor.furniture.length : 0;
      
      // Agregar detalles del piso
      floorDetails.push({
        name: `Planta ${floorKey}`,
        airEntryCount,
        wallCount,
        stairCount,
        furnitureCount
      });
      
      if (airEntryCount === 0) {
        warnings.push(`Planta ${floorKey}: Sin Air Entries definidas`);
      }
    }

    const isValid = errors.length === 0;
    const preview = isValid ? {
      version: data.version || "Unknown",
      floorCount: floorKeys.length,
      floors: floorKeys.map(key => `Planta ${key}`),
      floorDetails
    } : undefined;

    return { isValid, errors, warnings, preview };
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
      toast({
        title: "Archivo no válido",
        description: "Por favor selecciona un archivo JSON",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setIsLoading(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setParsedData(data);
      
      const validationResult = validateDesignData(data);
      setValidation(validationResult);

      if (validationResult.isValid) {
        toast({
          title: "Archivo cargado correctamente",
          description: `Diseño con ${validationResult.preview?.floorCount} plantas`,
        });
      }
    } catch (error) {
      toast({
        title: "Error al leer el archivo",
        description: "El archivo JSON no es válido",
        variant: "destructive",
      });
      setValidation({
        isValid: false,
        errors: ["El archivo JSON no es válido o está corrupto"],
        warnings: []
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoad = () => {
    if (!parsedData || !validation?.isValid) return;

    onLoad(parsedData);
    handleClose();
    
    toast({
      title: "Diseño cargado",
      description: "El diseño se ha cargado correctamente",
    });
  };

  const handleClose = () => {
    setSelectedFile(null);
    setParsedData(null);
    setValidation(null);
    setIsLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Cargar Diseño
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Input */}
          <div className="space-y-2">
            <Label htmlFor="file-input">Seleccionar archivo JSON</Label>
            <Input
              id="file-input"
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              disabled={isLoading}
            />
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              Procesando archivo...
            </div>
          )}

          {/* Validation Results */}
          {validation && (
            <div className="space-y-3">
              {/* Success */}
              {validation.isValid && validation.preview && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <div className="font-medium">Archivo válido</div>
                      <div className="text-sm space-y-2">
                        <div>Versión: {validation.preview.version}</div>
                        <div>Plantas: {validation.preview.floorCount}</div>
                        <div>Pisos: {validation.preview.floors.join(", ")}</div>
                        
                        <div className="mt-3">
                          <div className="font-medium text-gray-700 mb-2">Detalles por planta:</div>
                          {validation.preview.floorDetails.map((floor, index) => (
                            <div key={index} className="ml-2 text-xs bg-gray-50 p-2 rounded border mb-1">
                              <div className="font-medium">{floor.name}:</div>
                              <div>• AirEntries: {floor.airEntryCount}</div>
                              <div>• Paredes: {floor.wallCount}</div>
                              <div>• Escaleras: {floor.stairCount}</div>
                              <div>• Furniture: {floor.furnitureCount}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Errors */}
              {validation.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <div className="font-medium">Errores encontrados:</div>
                      <ul className="text-sm list-disc list-inside">
                        {validation.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Warnings */}
              {validation.warnings.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <div className="font-medium">Advertencias:</div>
                      <ul className="text-sm list-disc list-inside">
                        {validation.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* File Preview */}
          {selectedFile && (
            <div className="bg-muted p-3 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-muted-foreground">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleLoad}
            disabled={!validation?.isValid || isLoading}
          >
            Cargar Diseño
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}