# matplotlib's backend in Quaera Lab's Python tabs (MPLBACKEND, set by lab.py): draws with Agg, and
# plt.show() puts the figures in the cell's output where it is called, as Jupyter does.
from matplotlib.backend_bases import FigureManagerBase as FigureManager  # noqa: F401
from matplotlib.backends.backend_agg import FigureCanvasAgg as FigureCanvas  # noqa: F401


def show(*args, **kwargs):
    import lab

    lab._flush_figures()
