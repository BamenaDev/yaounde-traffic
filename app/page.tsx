 "use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

import DestinationSearch from "./DestinationSearch";

type Position = {
  lat: number;
  lng: number;
};

type Destination = {
  name: string;
  lat: number;
  lng: number;
};

type NavigationStep = {
  instruction: string;
  distanceMeters: number;
  maneuver?: string;

  startLocation?: {
    lat: number;
    lng: number;
  };

  endLocation?: {
    lat: number;
    lng: number;
  };
};

type RouteInfo = {
  index: number;
  distanceKm: number;
  durationMinutes: number;
  steps: NavigationStep[];
};

const YAOUNDE: Position = {
  lat: 3.848,
  lng: 11.5021,
};

/*
  Couche trafic Google Maps
*/
function TrafficLayer() {
  const map = useMap();
  const mapsLibrary = useMapsLibrary("maps");

  useEffect(() => {
    if (!map || !mapsLibrary) return;

    const trafficLayer =
      new mapsLibrary.TrafficLayer();

    trafficLayer.setMap(map);

    return () => {
      trafficLayer.setMap(null);
    };
  }, [map, mapsLibrary]);

  return null;
}

/*
  La carte suit la position GPS.
  Aucun recalcul d'itinéraire ici.
*/
function FollowUser({
  position,
  enabled,
}: {
  position: Position | null;
  enabled: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !position || !enabled) {
      return;
    }

    map.panTo(position);
  }, [map, position, enabled]);

  return null;
}

type RouteLayerProps = {
  startPosition: Position | null;
  destination: Destination | null;
  routeRequestId: number;

  onRoutesCalculated: (
    routes: RouteInfo[]
  ) => void;

  onRouteError: (
    message: string
  ) => void;

  onLoadingChange: (
    loading: boolean
  ) => void;
};

function RouteLayer({
  startPosition,
  destination,
  routeRequestId,
  onRoutesCalculated,
  onRouteError,
  onLoadingChange,
}: RouteLayerProps) {
  const map = useMap();

  const routesLibrary =
    useMapsLibrary("routes");

  const polylinesRef =
    useRef<google.maps.Polyline[]>([]);

  const lastProcessedRequest =
    useRef(0);

  const requestCounter =
    useRef(0);

  /*
    Nouvelle destination.
  */
  useEffect(() => {
    lastProcessedRequest.current = 0;

    polylinesRef.current.forEach(
      (polyline) => {
        polyline.setMap(null);
      }
    );

    polylinesRef.current = [];
  }, [destination]);

  /*
    Nettoyage général.
  */
  useEffect(() => {
    return () => {
      polylinesRef.current.forEach(
        (polyline) => {
          polyline.setMap(null);
        }
      );
    };
  }, []);

  useEffect(() => {
    if (
      !map ||
      !routesLibrary ||
      !startPosition ||
      !destination ||
      routeRequestId === 0
    ) {
      return;
    }

    /*
      Un même clic ne doit jamais
      créer plusieurs requêtes.
    */
    if (
      routeRequestId ===
      lastProcessedRequest.current
    ) {
      return;
    }

    lastProcessedRequest.current =
      routeRequestId;

    requestCounter.current += 1;

    const currentRequest =
      requestCounter.current;

    const calculateRoutes =
      async () => {
        onLoadingChange(true);
        onRouteError("");

        try {
          const request:
            google.maps.routes.ComputeRoutesRequest =
          {
            origin: {
              lat: startPosition.lat,
              lng: startPosition.lng,
            },

            destination: {
              lat: destination.lat,
              lng: destination.lng,
            },

            travelMode: "DRIVING",

            routingPreference:
              "TRAFFIC_AWARE_OPTIMAL",

            computeAlternativeRoutes:
              true,

           fields: [
  "path",
  "distanceMeters",
  "durationMillis",
  "viewport",
  "legs",
  
],
          };

          const { routes } =
            await routesLibrary.Route.computeRoutes(
              request
            );

          /*
            Une recherche plus récente existe.
          */
          if (
            currentRequest !==
            requestCounter.current
          ) {
            return;
          }

          if (
            !routes ||
            routes.length === 0
          ) {
 onRouteError(
              "Aucun itinéraire trouvé."
            );

            return;
          }

          /*
            Trier les itinéraires
            du plus rapide au plus lent.
          */
          const sortedRoutes =
            [...routes].sort(
              (a, b) =>
                (a.durationMillis ??
                  Infinity) -
                (b.durationMillis ??
                  Infinity)
            );

          const routeInfos: RouteInfo[] =
            [];

          const newPolylines:
            google.maps.Polyline[] = [];

          sortedRoutes.forEach(
            (route, index) => {
              const polylines =
                route.createPolylines();

              polylines.forEach(
                (polyline) => {
                  polyline.setOptions({
                    strokeWeight:
                      index === 0
                        ? 8
                        : 5,

                    strokeOpacity:
                      index === 0
                        ? 1
                        : 0.35,
                  });

                  polyline.setMap(map);
                }
              );

              newPolylines.push(
                ...polylines
              );

  const navigationSteps: NavigationStep[] = [];

route.legs?.forEach((leg) => {
  leg.steps?.forEach((step) => {
    navigationSteps.push({
      instruction:
        translateInstruction(step.instructions ?? "") ?? "",

      distanceMeters:
        step.distanceMeters ?? 0,

      maneuver:
        step.maneuver ?? undefined,

      startLocation: step.startLocation
        ? {
            lat: step.startLocation.lat,
            lng: step.startLocation.lng,
          }
        : undefined,

      endLocation: step.endLocation
        ? {
            lat: step.endLocation.lat,
            lng: step.endLocation.lng,
          }
        : undefined,
    });
  });
});
routeInfos.push({
  index,

  distanceKm:
    (route.distanceMeters ?? 0) / 1000,

  durationMinutes:
    (route.durationMillis ?? 0) / 60000,

  steps: navigationSteps,
});
            }
          );

          /*
            On enlève les anciens trajets
            seulement après un nouveau succès.
          */
          polylinesRef.current.forEach(
            (polyline) => {
              polyline.setMap(null);
            }
          );

          polylinesRef.current =
            newPolylines;

          onRoutesCalculated(
            routeInfos
          );

          if (
            sortedRoutes[0]?.viewport
          ) {
            map.fitBounds(
              sortedRoutes[0].viewport
            );
          }
        } catch (error) {
          console.error(
            "Erreur Routes API :",
            error
          );

          onRouteError(
            "Impossible de calculer les itinéraires."
          );
        } finally {
          if (
            currentRequest ===
            requestCounter.current
          ) {
            onLoadingChange(false);
          }
        }
      };

    calculateRoutes();
  }, [
    map,
    routesLibrary,
    startPosition,
    destination,
    routeRequestId,
    onRoutesCalculated,
    onRouteError,
    onLoadingChange,
  ]);

  return null;
}

function translateInstruction(instruction: string): string {
  return instruction
    .replace(/^Head northwest/i, "Dirigez-vous vers le nord-ouest")
    .replace(/^Head northeast/i, "Dirigez-vous vers le nord-est")
    .replace(/^Head southwest/i, "Dirigez-vous vers le sud-ouest")
    .replace(/^Head southeast/i, "Dirigez-vous vers le sud-est")
    .replace(/^Head north/i, "Dirigez-vous vers le nord")
    .replace(/^Head south/i, "Dirigez-vous vers le sud")
    .replace(/^Head east/i, "Dirigez-vous vers l’est")
    .replace(/^Head west/i, "Dirigez-vous vers l’ouest")
    .replace(/^Turn left/i, "Tournez à gauche")
    .replace(/^Turn right/i, "Tournez à droite")
    .replace(/^Slight left/i, "Tournez légèrement à gauche")
    .replace(/^Slight right/i, "Tournez légèrement à droite")
    .replace(/^Make a U-turn/i, "Faites demi-tour")
    .replace(
      /^At the roundabout, take the 1st exit/i,
      "Au rond-point, prenez la 1re sortie"
    )
    .replace(
      /^At the roundabout, take the 2nd exit/i,
      "Au rond-point, prenez la 2e sortie"
    )
    .replace(
      /^At the roundabout, take the 3rd exit/i,
      "Au rond-point, prenez la 3e sortie"
    )
    .replace(
      /^At the roundabout, take the 4th exit/i,
      "Au rond-point, prenez la 4e sortie"
    )
    .replace(
      /Destination will be on the left/i,
      "La destination se trouvera sur votre gauche"
    )
    .replace(
      /Destination will be on the right/i,
      "La destination se trouvera sur votre droite"
    );
}

export default function Home() {
  const apiKey =
    process.env
      .NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  /*
    Position GPS actuelle.
    Elle évolue pendant le déplacement.
  */
  const [position, setPosition] =
    useState<Position | null>(null);

    const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  /*
    Position figée au moment où
    l'utilisateur demande un calcul.
  */
  const [
    routeStartPosition,
    setRouteStartPosition,
  ] =
    useState<Position | null>(null);

  const [
    destination,
    setDestination,
  ] =
    useState<Destination | null>(
      null
    );

  const [
    locationStatus,
    setLocationStatus,
  ] =
    useState(
      "Recherche de votre position..."
    );

  const [
    routesInfo,
    setRoutesInfo,
  ] =
    useState<RouteInfo[]>([]);

  const [
    routeError,
    setRouteError,
  ] =
    useState("");

  const [
    routeRequestId,
    setRouteRequestId,
  ] =
    useState(0);

  const [
    routeLoading,
    setRouteLoading,
  ] =
    useState(false);

  /*
    Active le suivi visuel de la voiture.
  */
  const [
    followPosition,
    setFollowPosition,
  ] =
    useState(true);

  /*
    Heure du dernier calcul.
  */
  const [
    lastCalculation,
    setLastCalculation,
  ] =
    useState<Date | null>(null);

  /*
    GPS en temps réel.
  */
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus(
        "GPS non disponible."
      );
 return;
    }

    const watchId =
      navigator.geolocation.watchPosition(
        (location) => {
          const currentPosition:
            Position = {
            lat:
              location.coords
                .latitude,

            lng:
              location.coords
                .longitude,
          };

          setPosition(
            currentPosition
          );

          setLocationStatus(
            "Position suivie en temps réel"
          );
        },

        (error) => {
          console.error(
            "Erreur GPS :",
            error
          );

          setLocationStatus(
            "Impossible de suivre votre position."
          );
        },

        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 2000,
        }
      );

    return () => {
      navigator.geolocation.clearWatch(
        watchId
      );
    };
  }, []);

  const handleRoutesCalculated =
    useCallback(
      (routes: RouteInfo[]) => {
        setRoutesInfo(routes);

        setRouteError("");

        setLastCalculation(
          new Date()
        );
      },
      []
    );

  const handleRouteError =
    useCallback(
      (message: string) => {
        setRouteError(message);
      },
      []
    );

  const handleLoadingChange =
    useCallback(
      (loading: boolean) => {
        setRouteLoading(loading);
      },
      []
    );

  /*
    Fonction unique pour calculer
    ou recalculer manuellement.
  */
  const requestRoute = () => {
    if (
      !position ||
      !destination ||
      routeLoading
    ) {
      return;
    }

    /*
      Nouvelle position de départ.
    */
    setRouteStartPosition({
      ...position,
    });

    setRouteError("");

    setRouteRequestId(
      (previous) =>
        previous + 1
    );
  };

  /*
    Meilleur trajet.
  */
  const bestRoute =
    routesInfo.length > 0
      ? routesInfo[0]
      : null;

  /*
    Heure d'arrivée.
  */
  let arrivalTime = "";

  if (
    bestRoute &&
    lastCalculation
  ) {
    const arrival =
      new Date(
        lastCalculation.getTime() +
          bestRoute.durationMinutes *
            60 *
            1000
      );

    arrivalTime =
      arrival.toLocaleTimeString(
        "fr-FR",
        {
          hour: "2-digit",
          minute: "2-digit",
        }
      );
  }

  if (!apiKey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">

        <p className="text-red-600">
          Clé Google Maps introuvable.
        </p>

      </main>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      libraries={[
        "places",
      ]}
    >
      <main className="min-h-screen bg-gray-100">

        <header className="bg-green-700 px-6 py-5 text-white shadow-md">

          <div className="mx-auto max-w-6xl">

            <h1 className="text-2xl font-bold">
              Yaoundé Traffic
            </h1>

            <p className="text-sm text-green-100">
              Évitez les embouteillages.
              Trouvez le meilleur trajet.
            </p>

          </div>

        </header>

        <section className="mx-auto max-w-6xl p-6">

          <div className="mb-6 rounded-2xl bg-white p-6 shadow">

            <p className="mb-2 text-sm text-gray-500">
              Votre position
            </p>

            <h2 className="text-xl font-semibold text-gray-900">

              📍 {locationStatus}

            </h2>

            {position && (
              <p className="mt-2 text-sm text-gray-500">

                Latitude :{" "}
                {position.lat.toFixed(
                  6
                )}

                <br />

                Longitude :{" "}
                {position.lng.toFixed(
                  6
                )}

              </p>
            )}

            <label className="mb-2 mt-6 block font-medium text-gray-700">
              Où voulez-vous aller ?
            </label>

            <DestinationSearch
              onPlaceSelected={(
                place
 ) => {
                setDestination({
                  name:
                    place.name,

                  lat:
                    place.lat,

                  lng:
                    place.lng,
                });

                setRoutesInfo([]);

                setRouteError("");

                setLastCalculation(
                  null
                );

                setRouteStartPosition(
                  null
                );

                setRouteRequestId(
                  0
                );
              }}
            />



            {destination && (
              <div className="mt-4 rounded-xl bg-green-50 p-4">

                <p className="text-sm text-gray-500">
                  Destination sélectionnée
                </p>

                <p className="font-semibold text-green-800">

                  📍{" "}
                  {
                    destination.name
                  }

                </p>

              </div>
            )}

            <button
              type="button"

              disabled={
                !position ||
                !destination ||
                routeLoading
              }

              onClick={
                requestRoute
              }

              className="mt-4 w-full rounded-xl bg-green-700 p-4 font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-gray-400"
            >

              {routeLoading
                ? "Calcul en cours..."
                : routesInfo.length >
                    0
                  ? "Recalculer maintenant"
                  : "Rechercher un itinéraire"}

            </button>

{bestRoute?.steps?.[0] && (
  <div className="mt-6 rounded-2xl border-2 border-green-600 bg-green-50 p-5">
    
    <p className="text-sm font-semibold text-green-700">
      PROCHAINE INSTRUCTION
    </p>

    <div className="mt-3">
      <p className="text-2xl font-bold text-gray-900">
        {bestRoute.steps[0].instruction}
      </p>

      <p className="mt-2 text-lg font-semibold text-green-700">
        dans{" "}
        {bestRoute.steps[0].distanceMeters >= 1000
          ? `${(bestRoute.steps[0].distanceMeters / 1000).toFixed(1)} km`
          : `${Math.round(bestRoute.steps[0].distanceMeters)} m`}
      </p>
    </div>

    {bestRoute?.steps?.[1] && (
      <div className="mt-4 border-t border-green-200 pt-3">
        <p className="text-sm text-gray-500">
          Ensuite
        </p>

        <p className="font-semibold text-gray-700">
          {bestRoute.steps[1].instruction}
        </p>
      </div>
    )}

  </div>
)}

            {(bestRoute?.steps?.length ?? 0) > 0 && (
  <div className="mt-6 rounded-2xl bg-white p-5">
    <h3 className="text-lg font-bold text-gray-900">
      Instructions de navigation
    </h3>

    <div className="mt-4 space-y-3">
      {bestRoute?.steps?.map((step, index) => (
        <div
          key={index}
          className="rounded-xl border border-gray-200 p-4"
        >
          <p className="font-semibold text-gray-900">
            {index + 1}. {step.instruction}
          </p>

          <p className="mt-1 text-sm text-gray-500">
            {step.distanceMeters >= 1000
              ? `${(step.distanceMeters / 1000).toFixed(1)} km`
              : `${Math.round(step.distanceMeters)} m`}
          </p>
        </div>
      ))}
    </div>
  </div>
)}

            {bestRoute && (
              <div className="mt-6 rounded-2xl border-2 border-green-600 bg-green-50 p-6">

                <p className="text-sm text-gray-500">
                  Navigation vers
                </p>

                <h3 className="mt-1 text-xl font-bold text-gray-900">

                  📍{" "}
                  {
                    destination?.name
                  }

                </h3>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">

                  <div className="rounded-xl bg-white p-4">

                    <p className="text-sm text-gray-500">
                      Temps restant
                    </p>

                    <p className="mt-1 text-2xl font-bold text-gray-900">

                      🚗{" "}
                      {Math.round(
                        bestRoute.durationMinutes
                      )}{" "}
                      min

                    </p>

                  </div>

                  <div className="rounded-xl bg-white p-4">

                    <p className="text-sm text-gray-500">
                      Distance restante
                    </p>

                    <p className="mt-1 text-2xl font-bold text-gray-900">

                      📏{" "}
                      {bestRoute.distanceKm.toFixed(
                        1
                      )}{" "}
                      km

                    </p>

                  </div>

                  <div className="rounded-xl bg-white p-4">

                    <p className="text-sm text-gray-500">
                      Arrivée estimée
                    </p>

                    <p className="mt-1 text-2xl font-bold text-gray-900">

                      🕒{" "}
                      {arrivalTime}

                    </p>

                  </div>

                </div>

                <p className="mt-4 font-medium text-green-700">
                  🟢 Meilleur trajet selon le trafic actuel
                </p>

                <p className="mt-2 text-sm text-gray-600">

                  {routesInfo.length -
                    1}{" "}
                  itinéraire
                  {routesInfo.length -
                    1 >
                  1
                    ? "s"
                    : ""}{" "}
                  alternatif
                  {routesInfo.length -
                    1 >
 1
                    ? "s"
                    : ""}

                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Distance et durée mises à jour lors du dernier calcul manuel.
                </p>

              </div>
            )}

            {routesInfo.length >
              1 && (
              <div className="mt-5 space-y-3">

                {routesInfo
                  .slice(1)
                  .map(
                    (
                      route,
                      index
                    ) => {
                      const difference =
                        route.durationMinutes -
                        routesInfo[0]
                          .durationMinutes;

                      return (
                        <div
                          key={
                            route.index
                          }

                          className="rounded-xl border border-gray-200 bg-gray-50 p-5"
                        >

                          <p className="text-sm text-gray-500">

                            Itinéraire alternatif{" "}
                            {index +
                              1}

                          </p>

                          <p className="mt-2 text-xl font-bold text-gray-900">

                            🚗{" "}
                            {Math.round(
                              route.durationMinutes
                            )}{" "}
                            min

                          </p>

                          <p className="mt-1 text-gray-700">

                            📏{" "}
                            {route.distanceKm.toFixed(
                              1
                            )}{" "}
                            km

                          </p>

                          <p className="mt-2 text-sm text-gray-600">

                            +
                            {Math.max(
                              0,
                              Math.round(
                                difference
                              )
                            )}{" "}
                            min

                          </p>

                        </div>
                      );
                    }
                  )}

              </div>
            )}

            {routeError && (
              <div className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">

                {routeError}

              </div>
            )}

          </div>

          <div className="mb-4 flex items-center justify-between rounded-xl bg-white p-4 shadow">

            <div>

              <p className="font-medium text-gray-900">
                Suivi de la carte
              </p>

              <p className="text-sm text-gray-500">

                {followPosition
                  ? "La carte suit votre position."
                  : "Déplacement libre sur la carte."}

              </p>

            </div>

            <button
              type="button"

              onClick={() =>
                setFollowPosition(
                  (previous) =>
                    !previous
                )
              }

              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
            >

              {followPosition
                ? "Désactiver"
                : "Suivre ma position"}

            </button>

          </div>

          <div className="h-[550px] overflow-hidden rounded-2xl bg-gray-200 shadow">

            <Map
              defaultCenter={
                YAOUNDE
              }

              defaultZoom={
                13
              }

              gestureHandling="greedy"

              disableDefaultUI={
                false
              }

              mapId="DEMO_MAP_ID"
            >

              <TrafficLayer />

              <FollowUser
                position={
                  position
                }

                enabled={
                  followPosition
                }
 />

              <RouteLayer
                startPosition={
                  routeStartPosition
                }

                destination={
                  destination
                }

                routeRequestId={
                  routeRequestId
                }

                onRoutesCalculated={
                  handleRoutesCalculated
                }

                onRouteError={
                  handleRouteError
                }

                onLoadingChange={
                  handleLoadingChange
                }
              />

              {position && (
                <AdvancedMarker
                  position={
                    position
                  }

                  title="Votre position actuelle"
                />
              )}

              {destination && (
                <AdvancedMarker
                  position={{
                    lat:
                      destination.lat,

                    lng:
                      destination.lng,
                  }}

                  title={
                    destination.name
                  }
                />
              )}

            </Map>

          </div>

        </section>

      </main>
    </APIProvider>
  );
}