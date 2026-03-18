from typing import Any, Dict
from server.base_logic import BaseSportLogic


class GeneralLogic(BaseSportLogic):

    def process_frame(self, data: Dict[str, Any]) -> None:
        pass

    def get_metrics(self) -> Dict[str, Any]:
        return {}

    def reset(self) -> None:
        pass
