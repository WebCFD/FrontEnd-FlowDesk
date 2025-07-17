  const renderStep1 = () => {
    return (
      <>
        <Card className="mt-4">
          <CardContent className="p-4">
            <ToolbarToggle
              mode={tab}
              onModeChange={(value: "2d-editor" | "3d-preview") => {
                if (value === "3d-preview" && !hasClosedContour) {
                  toast({
                    title: "Invalid Room Layout",
                    description:
                      "Please create a closed room contour before viewing in 3D",
                    variant: "destructive",
                  });
                  return;
                }
                setTab(value);
              }}
              hasClosedContour={hasClosedContour}
            />

            <div className="flex gap-4" style={{ height: `calc(100vh - ${viewportOffset}px)` }}>
              {/* Left side menus */}
              <div className="w-72 space-y-6 overflow-y-auto" style={{ height: `calc(100vh - ${viewportOffset}px)` }}>
                {/* 2D Configuration - only show when in 2D mode */}
                {tab === "2d-editor" && (
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold text-xl mb-4 text-center">2D Configuration</h3>
                    
                    {/* Wall Design */}
                    <div className="space-y-4">
                      <h3 className="font-semibold">Wall Design</h3>
                      <div className="flex items-start gap-4">
                        {/* Wall Line Button */}
                        <Button
                          variant={currentTool === "wall" ? "default" : "outline"}
                          className={getWallStyles()}
                          onClick={() => handleToolSelect("wall")}
                        >
                          <div className="w-6 h-6 bg-primary/20 rounded-sm" />
                          <span className="text-xs mt-1">Wall Line</span>
                        </Button>
                        
                        {/* Wall Temperature */}
                        <div className="space-y-2 flex-1">
                          <TooltipProvider>
                            <div className="flex items-center gap-1">
                              <Label htmlFor="default-wall-temp" className="text-sm font-medium">
                                Wall Temperature
                              </Label>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="w-3 h-3 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-64">
                                    Default temperature assigned to new walls when created. 
                                    You can change individual wall temperatures by double-clicking on any wall.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                          <div className="flex items-center gap-2">
                            <Input
                              id="default-wall-temp"
                              type="number"
                              value={defaultWallTemperature}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                if (!isNaN(value) && value >= -50 && value <= 100) {
                                  setDefaultWallTemperature(value);
                                }
                              }}
                              className="w-20 h-8"
                              min={-50}
                              max={100}
                              step={0.5}
                              placeholder="20"
                            />
                            <span className="text-sm text-gray-500">°C</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 mt-4">
                      <h3 className="font-semibold">Air Entries</h3>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          className={getAirEntryStyles("window")}
                          onClick={() => handleAirEntrySelect("window")}
                        >
                          <div className="w-6 h-6 border-2 border-blue-500 grid grid-cols-2" />
                          <span className="text-xs mt-1">Window</span>
                        </Button>
                        <Button
                          variant="outline"
                          className={getAirEntryStyles("door")}
                          onClick={() => handleAirEntrySelect("door")}
                        >
                          <div className="w-6 h-6 border-2 border-amber-500" />
                          <span className="text-xs mt-1">Door</span>
                        </Button>
                        <Button
                          variant="outline"
                          className={getAirEntryStyles("vent")}
                          onClick={() => handleAirEntrySelect("vent")}
                        >
                          <div className="w-6 h-6 border-2 border-green-500 grid grid-cols-2 grid-rows-2" />
                          <span className="text-xs mt-1">Vent-Grid</span>
                        </Button>
                      </div>
                    </div>

                    {/* Stair Design - Moved from Parameters */}
                    {isMultifloor && (
                      <div className="space-y-4 mt-4">
                        <h3 className="font-semibold">Stair Design</h3>
                        <div className="flex items-start gap-4">
                          {/* Stair Design Button */}
                          <Button
                            variant="outline"
                            className={getStairStyles()}
                            onClick={() => {
                              handleToolSelect("stairs");
                              if (currentTool !== "stairs") {
                                setTab("2d-editor");
                                toast({
                                  title: "Stair Design Tool Activated",
                                  description:
                                    "Click on the canvas to place points and create a stair polygon. Close the shape by clicking near the first point.",
                                });
                              }
                            }}
                          >
                            <FileEdit className="w-6 h-6" />
                            <span className="text-xs mt-1">Stair Design</span>
                          </Button>
                          
                          {/* Stair Temperature */}
                          <div className="space-y-2 flex-1">
                            <TooltipProvider>
                              <div className="flex items-center gap-1">
                                <Label htmlFor="default-stair-temp" className="text-sm font-medium">
                                  Stair Temperature
                                </Label>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Info className="w-3 h-3 text-gray-400" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-64">
                                      Default temperature assigned to new stairs when created. 
                                      You can change individual stair temperatures by double-clicking on any stair.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
                            <div className="flex items-center gap-2">
                              <Input
                                id="default-stair-temp"
                                type="number"
                                value={defaultStairTemperature}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  if (!isNaN(value) && value >= -50 && value <= 100) {
                                    setDefaultStairTemperature(value);
                                  }
                                }}
                                className="w-20 h-8"
                                min={-50}
                                max={100}
                                step={0.5}
                                placeholder="20"
                              />
                              <span className="text-sm text-gray-500">°C</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2D Tools Section */}
                    <div className="space-y-4 mt-4">
                      <h3 className="font-semibold">2D Tools</h3>
                      <div className="flex gap-4 justify-center">
                        <Button
                          variant={currentTool === "eraser" ? "default" : "outline"}
                          className="w-20 h-16 flex flex-col items-center justify-center gap-1"
                          onClick={() => handleToolSelect("eraser")}
                        >
                          <Eraser className="w-6 h-6" />
                          <span className="text-xs">Eraser</span>
                        </Button>
                        <Button
                          variant={currentTool === "measure" ? "default" : "outline"}
                          className="w-20 h-16 flex flex-col items-center justify-center gap-1"
                          onClick={() => handleToolSelect("measure")}
                        >
                          <Ruler className="w-6 h-6" />
                          <span className="text-xs">Measure</span>
                        </Button>
                      </div>
                    </div>

                    {/* Floor Management - Parameters content moved here */}
                    <div className="space-y-4 mt-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Floor Management</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsFloorManagementExpanded(!isFloorManagementExpanded)}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronDown className={cn("h-4 w-4 transition-transform", 
                            !isFloorManagementExpanded && "rotate-180")} />
                        </Button>
                      </div>
                      {isFloorManagementExpanded && (
                        <div className="space-y-4">
                          Test Floor Management Content
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {renderFilesMenu()}
            </div>

            {/* Right side - Canvas */}
            {renderCanvasSection("tabs")}
          </div>
        </CardContent>
      </Card>
      
      <AirEntryDialog
        type={currentAirEntry || "window"}
        isOpen={isAirEntryDialogOpen}
        onClose={() => {
          setIsAirEntryDialogOpen(false);
          setSelectedLine(null);
        }}
        onConfirm={handleAirEntryDimensionsConfirm}
      />
      </>
    );
  };