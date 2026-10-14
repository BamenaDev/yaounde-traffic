"use client";

import {
  useEffect,
  useRef,
} from "react";

import {
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

type SelectedPlace = {
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
};

type Props = {
  onPlaceSelected: (
    place: SelectedPlace
  ) => void;
};

export default function DestinationSearch({
  onPlaceSelected,
}: Props) {

  const containerRef =
    useRef<HTMLDivElement>(null);

  const placesLibrary =
    useMapsLibrary("places");

  /*
    Keep the latest callback without
    recreating the autocomplete element.
  */
  const onPlaceSelectedRef =
    useRef(onPlaceSelected);

  useEffect(() => {
    onPlaceSelectedRef.current =
      onPlaceSelected;
  }, [onPlaceSelected]);

  /*
    Initialize Google Places autocomplete.
  */
  useEffect(() => {

    if (
      !placesLibrary ||
      !containerRef.current
    ) {
      return;
    }

    const container =
      containerRef.current;

    const autocomplete =
      new placesLibrary.PlaceAutocompleteElement();

    autocomplete.placeholder =
      "Ex : Mvan, Bastos, Poste Centrale...";

    autocomplete.style.width =
      "100%";

    /*
      Restrict suggestions to Cameroon.
    */
    autocomplete.includedRegionCodes =
      ["cm"];

    /*
      Prefer results near Yaoundé.
      This is a preference, not a strict
      geographic restriction.
    */
    autocomplete.locationBias = {
      center: {
        lat: 3.848,
        lng: 11.5021,
      },
      radius: 50000,
    };

    container.appendChild(
      autocomplete
    );

    /*
      Handle destination selection.
    */
    const handlePlaceSelect =
      async (event: Event) => {

        try {

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
            console.error(
              "Selected place has no location."
            );

            return;
          }

          onPlaceSelectedRef.current({
            name:
              place.displayName ||
              place.formattedAddress ||
              "Destination",

            formattedAddress:
              place.formattedAddress || "",

            lat:
              place.location.lat(),

            lng:
              place.location.lng(),
          });

        } catch (error) {

          console.error(
            "Google Places selection error:",
            error
          );

        }
      };

    autocomplete.addEventListener(
      "gmp-select",
      handlePlaceSelect
    );

    /*
      Cleanup only when the Places
      library changes or the component
      unmounts.
    */
    return () => {

      autocomplete.removeEventListener(
        "gmp-select",
        handlePlaceSelect
      );

      autocomplete.remove();

    };

  }, [placesLibrary]);

  return (
    <div
      ref={containerRef}
      className="w-full"
    />
  );
}