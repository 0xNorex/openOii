import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MEDIA, imageReady, videoReady } from "./media";

describe("media placeholder", () => {
	it("marks an image ready on load", () => {
		render(<img alt="shot" className={MEDIA} {...imageReady} />);
		const img = screen.getByAltText("shot");
		expect(img).toHaveClass("media-placeholder");
		expect(img).not.toHaveAttribute("data-ready");
		fireEvent.load(img);
		expect(img).toHaveAttribute("data-ready", "true");
	});

	it("marks a failed image as error so the shimmer stops", () => {
		render(<img alt="broken" className={MEDIA} {...imageReady} />);
		const img = screen.getByAltText("broken");
		fireEvent.error(img);
		expect(img).toHaveAttribute("data-ready", "error");
	});

	it("marks a video ready once its first frame is loaded", () => {
		const { container } = render(<video className={MEDIA} {...videoReady} />);
		const video = container.querySelector("video")!;
		fireEvent.loadedData(video);
		expect(video).toHaveAttribute("data-ready", "true");
	});
});
