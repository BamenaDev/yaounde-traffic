"use client";

import { useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

type SelectedPlace = {
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
};

type Props = {
  onPlaceSelected: (place: SelectedPlace) => void;
};

export default function DestinationSearch({
  onPlaceSelected,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const placesLibrary = useMapsLibrary("places");

  useEffect(() => {
    if (!placesLibrary || !containerRef.current) {
      return;
    }

    containerRef.current.innerHTML = "";

    const autocomplete =
      new placesLibrary.PlaceAutocompleteElement();

    autocomplete.placeholder =
      "Ex : Mvan, Bastos, Poste Centrale...";

    autocomplete.style.width = "100%";

    containerRef.current.appendChild(autocomplete);

    const handlePlaceSelect = async (event: Event) => {
      const placeEvent =
        event as google.maps.places.PlacePredictionSelectEvent;

      const place =
        placeEvent.placePrediction.toPlace();

      await place.fetchFields({
        fields: [
          "displayName",
          "formattedAddress",
          "location",
        ],
      });

      if (!place.location) {
        return;
      }

      onPlaceSelected({
        name:
          place.displayName ||
          place.formattedAddress ||
          "Destination",

        formattedAddress:
          place.formattedAddress || "",

        lat: place.location.lat(),

        lng: place.location.lng(),
      });
    };

    autocomplete.addEventListener(
      "gmp-select",
      handlePlaceSelect
    );

    return () => {
      autocomplete.removeEventListener(
        "gmp-select",
        handlePlaceSelect
      );

      autocomplete.remove();
    };
  }, [placesLibrary, onPlaceSelected]);

  return (
    <div
      ref={containerRef}
      className="w-full"
    />
  );
}