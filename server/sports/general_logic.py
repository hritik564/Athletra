from server.base_logic import BaseSportLogic, StandardOutput, empty_standard_output

_LOW_CONFIDENCE_THRESHOLD = 0.5


class GeneralLogic(BaseSportLogic):

    def __init__(self) -> None:
        super().__init__()
        self._last_packet = None
        self._issues: list[str] = []

    def process_frame(self, packet) -> None:
        self._last_packet = packet
        self._issues = []

        if packet.get("bbox_confidence", 1.0) < _LOW_CONFIDENCE_THRESHOLD:
            self._issues.append("low_confidence")

        if self.state == "idle":
            self.transition_to("recording")

    def get_metrics(self) -> StandardOutput:
        out = empty_standard_output()
        out["issues"] = list(self._issues)
        out["phase"] = self.state
        return out

    def reset(self) -> None:
        self._last_packet = None
        self._issues = []
        self.state = "idle"
