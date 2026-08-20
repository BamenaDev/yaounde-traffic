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

type RouteInfo = {
  index: number;
  distanceKm: number;
  durationMinutes: number;
};

const YAOUNDE: Position = {
  lat: 3.848,
  lng: 11.5021,
};

/*
  Distance approximative entre deux positions GPS.
*/
function distanceBetween(
  pointA: Position,
  pointB: Position
) {
  const earthRadius = 6371000;

  const lat1 =
    (pointA.lat * Math.PI) / 180;

  const lat2 =
    (pointB.lat * Math.PI) / 180;

  const deltaLat =
    ((pointB.lat - pointA.lat) *
      Math.PI) /
    180;

  const deltaLng =
    ((pointB.lng - pointA.lng) *
      Math.PI) /
    180;

  const a =
    Math.sin(deltaLat / 2) *
      Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}

/*
  Affichage du trafic.
*/
function TrafficLayer() {
  const map = useMap();

  const mapsLibrary =
    useMapsLibrary("maps");

  useEffect(() => {
    if (!map || !mapsLibrary) {
      return;
    }

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
  La carte suit l'utilisateur.
*/
function FollowUser({
  position,
}: {
  position: Position | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !position) {
      return;
    }

    map.panTo(position);
  }, [map, position]);

  return null;
}

type RouteLayerProps = {
  position: Position | null;
  destination: Destination | null;

  /*
    Augmente à chaque clic sur
    "Rechercher un itinéraire".
  */
  routeRequestId: number;

  onRoutesCalculated: (
    routes: RouteInfo[]
  ) => void;

  onRouteError: (
    message: string
  ) => void;
};

function RouteLayer({
  position,
  destination,
  routeRequestId,
  onRoutesCalculated,
  onRouteError,
}: RouteLayerProps) {
  const map = useMap();

  const routesLibrary =
    useMapsLibrary("routes");

  /*
    Routes actuellement affichées.
  */
  const polylinesRef =
    useRef<google.maps.Polyline[]>([]);

  /*
    Dernière position où un calcul
    a réellement réussi.
  */
  const lastSuccessfulPositionRef =
    useRef<Position | null>(null);

  /*
    Permet de reconnaître un nouveau
    clic manuel.
  */
  const lastManualRequestRef =
    useRef(0);

  /*
    Évite qu'une ancienne requête
    écrase une requête plus récente.
  */
  const requestCounterRef =
    useRef(0);

  /*
    Indique qu'au moins un trajet
    valide a déjà été trouvé.
  */
  const hasSuccessfulRouteRef =
    useRef(false);

  /*
    Nouvelle destination.
  */
  useEffect(() => {
    lastSuccessfulPositionRef.current =
      null;

    hasSuccessfulRouteRef.current =
      false;

    lastManualRequestRef.current =
      0;

    polylinesRef.current.forEach(
      (polyline) => {
        polyline.setMap(null);
      }
    );

    polylinesRef.current = [];
  }, [destination]);

  /*
    Nettoyage.
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
      !position ||
      !destination ||
      routeRequestId === 0
    ) {
      return;
    }

    /*
      Vérifie si le calcul vient
      d'un clic manuel.
    */
    const isManualRequest =
      routeRequestId !==
      lastManualRequestRef.current;

    /*
      Si ce n'est pas un clic manuel,
      il s'agit d'une mise à jour GPS.
    */
    if (
      !isManualRequest &&
      lastSuccessfulPositionRef.current
 ) {
      const movedDistance =
        distanceBetween(
          lastSuccessfulPositionRef.current,
          position
        );

      /*
        On ne recalcule pas pour
        quelques mètres de variation GPS.
      */
      if (movedDistance < 50) {
        return;
      }
    }

    if (isManualRequest) {
      lastManualRequestRef.current =
        routeRequestId;
    }

    /*
      Identifiant unique de cette requête.
    */
    requestCounterRef.current += 1;

    const currentRequest =
      requestCounterRef.current;

    const calculateRoutes =
      async () => {
        try {
          const request:
            google.maps.routes.ComputeRoutesRequest =
          {
            origin: {
              lat: position.lat,
              lng: position.lng,
            },

            destination: {
              lat: destination.lat,
              lng: destination.lng,
            },

            travelMode:
              "DRIVING",

            routingPreference:
              "TRAFFIC_AWARE_OPTIMAL",

            computeAlternativeRoutes:
              true,

            fields: [
              "path",
              "distanceMeters",
              "durationMillis",
              "viewport",
            ],
          };

          const { routes } =
            await routesLibrary.Route.computeRoutes(
              request
            );

          /*
            Une requête plus récente
            existe déjà.
          */
          if (
            currentRequest !==
            requestCounterRef.current
          ) {
            return;
          }

          if (
            !routes ||
            routes.length === 0
          ) {
            if (
              !hasSuccessfulRouteRef.current
            ) {
              onRouteError(
                "Aucun itinéraire trouvé."
              );
            }

            return;
          }

          /*
            Classer les routes par durée.
          */
          const sortedRoutes =
            [...routes].sort(
              (routeA, routeB) =>
                (routeA.durationMillis ??
                  Infinity) -
                (routeB.durationMillis ??
                  Infinity)
            );

          const routeInfos:
            RouteInfo[] = [];

          const newPolylines:
            google.maps.Polyline[] =
            [];

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
                        : 0.4,
                  });

                  polyline.setMap(
                    map
                  );
                }
              );

              newPolylines.push(
                ...polylines
              );

              routeInfos.push({
                index,

                distanceKm:
                  (route.distanceMeters ??
                    0) / 1000,

                durationMinutes:
                  (route.durationMillis ??
                    0) / 60000,
              });
            }
          );

          /*
            Maintenant seulement,
            on supprime les anciennes
            routes.

            Ainsi, si Google échoue,
            l'ancien trajet reste affiché.
          */
          polylinesRef.current.forEach(
            (polyline) => {
              polyline.setMap(
                null
              );
            }
          );

          polylinesRef.current =
            newPolylines;

          /*
            La position est enregistrée
            seulement après un succès.
          */
          lastSuccessfulPositionRef.current =
            {
              ...position,
            };

          hasSuccessfulRouteRef.current =
            true;
 onRoutesCalculated(
            routeInfos
          );

          /*
            Ajuster la carte surtout
            lors d'une recherche manuelle.
          */
          if (
            isManualRequest &&
            sortedRoutes[0]
              .viewport
          ) {
            map.fitBounds(
              sortedRoutes[0]
                .viewport
            );
          }
        } catch (error) {
          /*
            Ignorer l'erreur d'une ancienne
            requête devenue inutile.
          */
          if (
            currentRequest !==
            requestCounterRef.current
          ) {
            return;
          }

          console.error(
            "Erreur Routes API :",
            error
          );

          /*
            Si on avait déjà un trajet,
            on le conserve au lieu
            d'afficher une erreur rouge.
          */
          if (
            !hasSuccessfulRouteRef.current
          ) {
            onRouteError(
              "Impossible de calculer les itinéraires."
            );
          }
        }
      };

    calculateRoutes();
  }, [
    map,
    routesLibrary,
    position,
    destination,
    routeRequestId,
    onRoutesCalculated,
    onRouteError,
  ]);

  return null;
}

export default function Home() {
  const apiKey =
    process.env
      .NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const [position, setPosition] =
    useState<Position | null>(
      null
    );

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
  ] = useState(
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
  ] = useState("");

  /*
    Chaque clic augmente ce numéro.
    Donc même sans bouger,
    une nouvelle recherche fonctionne.
  */
  const [
    routeRequestId,
    setRouteRequestId,
  ] = useState(0);

  /*
    GPS temps réel.
  */
  useEffect(() => {
    if (
      !navigator.geolocation
    ) {
      setLocationStatus(
        "La localisation GPS n'est pas disponible."
      );

      return;
    }

    setLocationStatus(
      "Recherche de votre position..."
    );

    const watchId =
      navigator.geolocation.watchPosition(
        (location) => {
          const newPosition:
            Position = {
            lat:
              location.coords
                .latitude,

            lng:
              location.coords
                .longitude,
          };

          setPosition(
            newPosition
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
          enableHighAccuracy:
            true,

          timeout: 15000,

          /*
            Autorise une position récente
            sans rappeler trop souvent
            le GPS.
          */
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
        setRoutesInfo(
          routes
        );

        setRouteError("");
      },
      []
    );

  const handleRouteError =
    useCallback(
      (message: string) => {
        setRouteError(
          message
        );
      },
      []
    );

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
              Évitez les embouteillages. Trouvez le meilleur trajet.
            </p>

          </div>

        </header>

        <section className="mx-auto max-w-6xl p-6">

          <div className="mb-6 rounded-2xl bg-white p-6 shadow">

            <p className="mb-2 text-sm text-gray-500">
              Votre position
            </p>

            <h2 className="text-xl font-semibold text-gray-900">

              📍{" "}
              {locationStatus}

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
                !destination
              }

              onClick={() => {
                setRouteError("");

                /*
                  Chaque clic force
                  une vraie nouvelle
                  recherche.
                */
                setRouteRequestId(
                  (previous) =>
                    previous + 1
                );
              }}

              className="mt-4 w-full rounded-xl bg-green-700 p-4 font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              Rechercher un itinéraire
            </button>

            {routesInfo.length >
              0 && (
              <div className="mt-6 space-y-4">

                {routesInfo.map(
                  (
                    route,
                    index
                  ) => {
                    const bestRoute =
                      routesInfo[0];

                    const extraMinutes =
                      route.durationMinutes -
                      bestRoute.durationMinutes;

                    return (
                      <div
                        key={
                          route.index
                        }

                        className={
                          index === 0
                            ? "rounded-xl border-2 border-green-600 bg-green-50 p-5"
                            : "rounded-xl border border-gray-200 bg-gray-50 p-5"
                        }
                      >

                        <p className="text-sm text-gray-500">

                          {index === 0
                            ? "Itinéraire recommandé"
                            : `Alternative ${index}`}

                        </p>
<p className="mt-2 text-2xl font-bold text-gray-900">

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

                        {index ===
                        0 ? (
                          <p className="mt-2 text-sm font-medium text-green-700">

                            🟢 Meilleur trajet selon le trafic actuel

                          </p>
                        ) : (
                          <p className="mt-2 text-sm text-gray-600">

                            +
                            {Math.max(
                              0,
                              Math.round(
                                extraMinutes
                              )
                            )}{" "}
                            min

                          </p>
                        )}

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
              />

              <RouteLayer
                position={
                  position
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
              />

              {position && (
                <AdvancedMarker
                  position={
                    position
                  }

                  title="Votre position"
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